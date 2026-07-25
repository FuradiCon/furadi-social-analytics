import json
from scripts.build_data import build, download_instagram_thumbnails

CHANNEL_CFGS = [
    {"slug": "furad-ride", "channel_id": "UC1", "token_path": "token_a.json", "accent": {"accent": "#FF5A00"}},
]


def _good_bundle(cfg, *args):
    return {"slug": cfg["slug"], "name": cfg["slug"], "accent": cfg["accent"], "data": [{"d": "2026-07-01", "views": 10}]}


def _failing_bundle(cfg, *args):
    raise RuntimeError("API down")


def test_build_writes_data_json_with_channels_and_instagram(tmp_path):
    def fake_instagram_fetcher(*a, **kw):
        return {"slug": "instagram", "platform": "instagram", "topVideos": []}

    published = build(
        channel_cfgs=CHANNEL_CFGS,
        channel_fetcher=_good_bundle,
        instagram_fetcher=fake_instagram_fetcher,
        out_dir=str(tmp_path),
    )

    assert published is True
    data = json.loads((tmp_path / "data.json").read_text())
    assert data["channels"][0]["slug"] == "furad-ride"
    assert data["channels"][-1]["platform"] == "instagram"
    assert "generatedAt" in data


def test_build_skips_publish_when_every_channel_and_instagram_fail(tmp_path):
    def fake_instagram_fetcher(*a, **kw):
        raise RuntimeError("Instagram down")

    published = build(
        channel_cfgs=CHANNEL_CFGS,
        channel_fetcher=_failing_bundle,
        instagram_fetcher=fake_instagram_fetcher,
        out_dir=str(tmp_path),
    )

    assert published is False
    assert not (tmp_path / "data.json").exists()


def test_build_continues_when_one_channel_fails(tmp_path):
    calls = {"n": 0}

    def flaky_fetcher(cfg, *args):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("first channel down")
        return _good_bundle(cfg, *args)

    two_channels = CHANNEL_CFGS + [{"slug": "furadi", "channel_id": "UC2", "token_path": "token_b.json", "accent": {"accent": "#00E5FF"}}]

    published = build(
        channel_cfgs=two_channels,
        channel_fetcher=flaky_fetcher,
        instagram_fetcher=lambda *a, **kw: {"slug": "instagram", "platform": "instagram", "topVideos": []},
        out_dir=str(tmp_path),
    )

    assert published is True
    data = json.loads((tmp_path / "data.json").read_text())
    slugs = [c["slug"] for c in data["channels"]]
    assert "furadi" in slugs


def test_download_instagram_thumbnails_skips_existing_file(tmp_path, monkeypatch):
    assets_dir = tmp_path / "assets"
    assets_dir.mkdir()
    existing = assets_dir / "media1.jpg"
    existing.write_bytes(b"already-here")

    def fail_if_called(url, dest_path):
        raise AssertionError("should not re-download existing thumbnail")

    monkeypatch.setattr("scripts.build_data.download_binary", fail_if_called)

    bundle = {"topVideos": [{"mediaId": "media1", "thumbUrl": "http://x/media1.jpg"}]}
    result = download_instagram_thumbnails(bundle, str(assets_dir))

    assert result["topVideos"][0]["thumb"] == "assets/media1.jpg"


def test_download_instagram_thumbnails_survives_one_failed_download(tmp_path, monkeypatch):
    assets_dir = tmp_path / "assets"
    assets_dir.mkdir()

    def flaky_download(url, dest_path):
        if "bad" in url:
            raise OSError("HTTP Error 403: Forbidden")
        with open(dest_path, "wb") as f:
            f.write(b"jpeg-bytes")

    monkeypatch.setattr("scripts.build_data.download_binary", flaky_download)

    bundle = {"topVideos": [
        {"mediaId": "good1", "thumbUrl": "http://x/good1.jpg"},
        {"mediaId": "bad1", "thumbUrl": "http://x/bad1.jpg"},
        {"mediaId": "good2", "thumbUrl": "http://x/good2.jpg"},
    ]}
    result = download_instagram_thumbnails(bundle, str(assets_dir))

    posts = result["topVideos"]
    assert len(posts) == 3
    assert posts[0]["thumb"] == "assets/good1.jpg"
    assert posts[1]["thumb"] == ""
    assert posts[2]["thumb"] == "assets/good2.jpg"


def test_build_keeps_instagram_bundle_when_a_thumbnail_download_fails(tmp_path, monkeypatch):
    def always_failing_download(url, dest_path):
        raise OSError("HTTP Error 403: Forbidden")

    monkeypatch.setattr("scripts.build_data.download_binary", always_failing_download)

    def fake_instagram_fetcher(*a, **kw):
        return {"slug": "instagram", "platform": "instagram", "followers": 1234, "topVideos": [
            {"mediaId": "m1", "thumbUrl": "http://x/m1.jpg"},
            {"mediaId": "m2", "thumbUrl": "http://x/m2.jpg"},
        ]}

    published = build(
        channel_cfgs=CHANNEL_CFGS,
        channel_fetcher=_good_bundle,
        instagram_fetcher=fake_instagram_fetcher,
        out_dir=str(tmp_path),
    )

    assert published is True
    data = json.loads((tmp_path / "data.json").read_text())
    ig = data["channels"][-1]
    assert ig["platform"] == "instagram"
    assert ig["followers"] == 1234
    assert len(ig["topVideos"]) == 2
