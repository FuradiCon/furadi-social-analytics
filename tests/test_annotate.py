import pytest

from scripts.annotate import gh_error, gh_warning


@pytest.fixture
def in_actions(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")


@pytest.fixture
def not_in_actions(monkeypatch):
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)


def test_gh_error_emits_actions_annotation(in_actions, capsys):
    gh_error("Instagram", "token write failed")
    out = capsys.readouterr().out
    assert out.startswith("::error::")
    assert "[Instagram]" in out
    assert "token write failed" in out


def test_gh_warning_emits_actions_annotation(in_actions, capsys):
    gh_warning("Instagram", "could not persist rotated token")
    out = capsys.readouterr().out
    assert out.startswith("::warning::")
    assert "[Instagram]" in out


def test_annotations_are_single_line_so_actions_does_not_truncate(in_actions, capsys):
    gh_error("Instagram", "line one\nline two\nline three")
    out = capsys.readouterr().out.rstrip("\n")
    assert "\n" not in out, "a multi-line annotation is silently cut off by Actions"
    assert "line one line two line three" in out


def test_falls_back_to_plain_text_outside_actions(not_in_actions, capsys):
    gh_error("Instagram", "token write failed")
    out = capsys.readouterr().out
    assert "::error::" not in out, "the Actions prefix is noise on a local terminal"
    assert "[Instagram]" in out
    assert "ERROR" in out
    assert "token write failed" in out
