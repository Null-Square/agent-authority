#!/usr/bin/env python3

import model_loop_gate as gate
from aggregate_runtime_support import patch_contract_gate

patch_contract_gate(gate)

if __name__ == "__main__":
    gate.main()
