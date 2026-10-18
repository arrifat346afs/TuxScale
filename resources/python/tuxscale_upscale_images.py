#!/usr/bin/env python3
"""
TuxScale PyTorch Image Upscaler - Entrypoint
"""

import os
import sys
import types

# Ensure resources/python directory is in sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)

# Guarded shim for torchvision.transforms.functional_tensor
try:
    import torchvision.transforms.functional_tensor  # noqa: F401
except ImportError:
    try:
        import torchvision.transforms
        import torchvision.transforms.functional as _F
        _mod = types.ModuleType('torchvision.transforms.functional_tensor')
        for _attr in dir(_F):
            if not _attr.startswith('__'):
                setattr(_mod, _attr, getattr(_F, _attr))
        sys.modules['torchvision.transforms.functional_tensor'] = _mod
        setattr(torchvision.transforms, 'functional_tensor', _mod)
    except Exception:
        pass

from tuxscale.images import main

if __name__ == '__main__':
    main()
