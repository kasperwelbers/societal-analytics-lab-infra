#!/usr/bin/env python3
"""Check the realm configuration in realms/*.yaml for mistakes Keycloak doesn't report.

Keycloak accepts these silently, and the login flows then do something else than intended:
- a "Condition - sub-flow executed" that refers to a sub-flow that doesn't exist (always
  "not executed", so e.g. users with 2FA get a second OTP prompt);
- an execution that refers to a sub-flow or setting (authenticatorConfig) that doesn't exist;
- a sub-flow that is defined but never used, or used in more than one place;
- keycloak-config-cli placeholders in comments (it substitutes those too, and fails).
It also checks that flows with the same name are identical in all realm files.

Usage: python3 check-realms.py [realms folder]   (requires PyYAML)
Exit code 0 when everything is fine, 1 otherwise.
"""

import sys
from collections import defaultdict
from pathlib import Path

import yaml

errors: list[str] = []


def err(file: Path, message: str) -> None:
    errors.append(f"{file.name}: {message}")


def flow_shape(flow: dict) -> list:
    """The structure of a flow, without settings that may differ per realm (e.g. maxAge)."""
    return [
        (
            e.get("authenticator"),
            e.get("flowAlias"),
            e.get("requirement"),
            e.get("priority"),
            e.get("authenticatorFlow"),
        )
        for e in flow.get("authenticationExecutions", [])
    ]


def check_file(path: Path, shapes: dict) -> None:
    text = path.read_text()
    for number, line in enumerate(text.splitlines(), start=1):
        comment = line.split("#", 1)[1] if "#" in line else ""
        if "$(" in comment:
            err(path, f"line {number}: placeholder in a comment (keycloak-config-cli substitutes it)")

    realm = yaml.safe_load(text)
    flows = {f["alias"]: f for f in realm.get("authenticationFlows", [])}
    configs = {c["alias"]: c for c in realm.get("authenticatorConfig", [])}
    used_subflows: dict[str, int] = defaultdict(int)
    used_configs: set[str] = set()
    checked_subflows: list[tuple[str, str]] = []

    for flow in flows.values():
        priorities = [e.get("priority") for e in flow.get("authenticationExecutions", [])]
        if len(priorities) != len(set(priorities)):
            err(path, f"flow '{flow['alias']}': duplicate priorities")
        for execution in flow.get("authenticationExecutions", []):
            sub = execution.get("flowAlias")
            if sub:
                used_subflows[sub] += 1
                if sub not in flows:
                    err(path, f"flow '{flow['alias']}' uses sub-flow '{sub}', which is not defined")
                elif flows[sub].get("topLevel"):
                    err(path, f"flow '{flow['alias']}' uses '{sub}' as sub-flow, but it is top level")
            config_alias = execution.get("authenticatorConfig")
            if config_alias:
                used_configs.add(config_alias)
                config = configs.get(config_alias)
                if config is None:
                    err(path, f"flow '{flow['alias']}' uses setting '{config_alias}', which is not defined")
                elif execution.get("authenticator") == "conditional-sub-flow-executed":
                    checked_subflows.append((config_alias, config["config"].get("flow_to_check")))
            if execution.get("authenticator") == "conditional-sub-flow-executed" and not config_alias:
                err(path, f"flow '{flow['alias']}': 'Condition - sub-flow executed' without a setting")

    for config_alias, target in checked_subflows:
        if target not in flows:
            err(path, f"setting '{config_alias}' checks sub-flow '{target}', which is not defined")
        elif used_subflows[target] == 0:
            err(path, f"setting '{config_alias}' checks sub-flow '{target}', which is never used")

    for alias, flow in flows.items():
        if not flow.get("topLevel") and used_subflows[alias] != 1:
            err(path, f"sub-flow '{alias}' is used {used_subflows[alias]} times (expected once)")
        shapes[alias].append((path.name, flow_shape(flow)))

    for alias in configs:
        if alias not in used_configs:
            err(path, f"setting '{alias}' is defined but never used")

    for setting in ("browserFlow", "directGrantFlow", "registrationFlow", "resetCredentialsFlow"):
        name = realm.get(setting)
        if name and name not in flows and name not in BUILT_IN_FLOWS:
            err(path, f"{setting} '{name}' is not defined")
    for idp in realm.get("identityProviders", []):
        for setting in ("firstBrokerLoginFlowAlias", "postBrokerLoginFlowAlias"):
            name = idp.get(setting)
            if name and name not in flows and name not in BUILT_IN_FLOWS:
                err(path, f"identity provider '{idp['alias']}': {setting} '{name}' is not defined")


BUILT_IN_FLOWS = {"browser", "first broker login", "direct grant", "registration", "reset credentials"}


def main() -> int:
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "realms"
    files = sorted(folder.glob("*.yaml"))
    if not files:
        print(f"No realm files in {folder}")
        return 1
    shapes: dict[str, list] = defaultdict(list)
    for path in files:
        check_file(path, shapes)
    for alias, variants in shapes.items():
        first_file, first_shape = variants[0]
        for other_file, other_shape in variants[1:]:
            if other_shape != first_shape:
                errors.append(f"flow '{alias}' differs between {first_file} and {other_file}")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"OK: {len(files)} realm files checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
