import sys

import pytest
import torch


@pytest.mark.skipif(sys.platform != "linux", reason="CUDA builds are Linux only")
def test_cuda_build_supports_desktop_gpu():
    # The desktop has an RTX 3070 (sm_86). Re-check after upgrading torch:
    # a newer default CUDA build on PyPI may drop older GPUs.
    assert "sm_86" in torch._C._cuda_getArchFlags()
