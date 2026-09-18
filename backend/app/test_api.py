from app.main import health


def test_health():
    assert health() == {"status": "ok", "service": "darukaa-earth-api"}
