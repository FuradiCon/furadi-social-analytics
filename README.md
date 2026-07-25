# Furadi's Social Media Analytics

A GitHub-hosted analytics dashboard for Furadi's YouTube channels (FuradRide, Furadi,
Furadi Desert Works, Furadi Games) and Instagram account. Data is fetched hourly by a
GitHub Actions workflow (`.github/workflows/update-dashboard.yml`) and rendered by the
static site in `docs/`, served via GitHub Pages.

## Local development

    pip install -r requirements.txt
    pytest
    python scripts/build_data.py   # writes docs/data.json + docs/assets/ using local token files
