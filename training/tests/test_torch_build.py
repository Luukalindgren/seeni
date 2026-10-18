import sys

import pytest
import torch


@pytest.mark.skipif(sys.platform != "linux", reason="CUDA builds are Linux only")
def test_cuda_build_supports_desktop_gpus():
    # RTX 2070 is sm_75 and RTX 3070 is sm_86. Re-check after upgrading torch:
    # a newer default CUDA build on PyPI may drop older GPUs.
    arch_flags = torch._C._cuda_getArchFlags()
    assert "sm_75" in arch_flags
    assert "sm_86" in arch_flags
