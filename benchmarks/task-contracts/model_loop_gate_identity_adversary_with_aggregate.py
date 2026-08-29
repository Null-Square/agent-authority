#!/usr/bin/env python3

import model_loop_gate as gate
from aggregate_runtime_support import patch_contract_gate

patch_contract_gate(gate)

# Importing this module replaces gate.replacement with the identity-aware
# structured-resource adversary while leaving the provider gate semantics intact.
import model_loop_gate_identity_adversary  # noqa: F401,E402

if __name__ == "__main__":
    gate.main()
