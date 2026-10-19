import platform
import subprocess
import sys

import pytest

# The desktop has an RTX 3070 (sm_86), which also runs sm_80 code.
DESKTOP_ARCHS = {"sm_80", "sm_86"}


@pytest.mark.skipif(
    sys.platform != "linux" or platform.machine() != "x86_64",
    reason="the desktop's CUDA build is Linux x86_64",
)
def test_cuda_build_supports_desktop_gpu():
    # Re-check after upgrading torch: a newer default CUDA build on PyPI may drop
    # older GPUs. Runs in a subprocess because querying CUDA in this process breaks
    # CUDA in forked workers (e.g. DataLoader) of later tests.
    result = subprocess.run(
        [sys.executable, "-c", "import torch; print(*torch.cuda.get_arch_list())"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert DESKTOP_ARCHS & set(result.stdout.split())
