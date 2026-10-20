import torch

from seeni.baseline import dangerous, outlier_scores, pool


def test_dangerous_confusion():
    assert dangerous("tappava", {"syötävä"})
    assert dangerous("myrkyllinen", {"esikäsiteltävä", "myrkyllinen"})
    assert dangerous("esikäsiteltävä", {"syötävä"})
    assert not dangerous("esikäsiteltävä", {"esikäsiteltävä"})
    assert not dangerous("tappava", {"myrkyllinen", "ei ruokasieni"})
    assert not dangerous("syötävä", {"tappava"})


def test_pool_is_cls_and_mean_patch():
    tokens = torch.arange(2 * 3 * 2, dtype=torch.float32).reshape(2, 3, 2)
    out = pool(tokens, prefix=1)
    assert out.shape == (2, 4)
    assert torch.equal(out[:, :2], tokens[:, 0])
    assert torch.equal(out[:, 2:], tokens[:, 1:].mean(1))


def test_outlier_has_low_score_and_ignores_its_own_observation():
    torch.manual_seed(0)
    a = torch.randn(1, 8) + torch.randn(20, 8) * 0.1
    b = torch.randn(1, 8) + torch.randn(20, 8) * 0.1
    x = torch.cat([a, b, b[:1] + 0.01])  # last image is labelled a but looks like b
    labels = ["a"] * 20 + ["b"] * 20 + ["a"]
    groups = list(range(40)) + [0]  # shares an observation with the first a image
    own, same = outlier_scores(x, labels, groups, k=5)
    assert own[-1] < own[:20].min()
    assert same[-1] == 0
