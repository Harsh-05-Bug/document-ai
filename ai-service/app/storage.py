"""Mirror of the Node storage layer: same keys, same two drivers."""
import os
import shutil
import tempfile
from contextlib import contextmanager

from app.config import (
    STORAGE_DRIVER, STORAGE_DIR, AWS_REGION, AWS_S3_BUCKET,
    S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
)

_s3_client = None


def _client():
    """
    A boto3 client for any S3-compatible service.

    S3_ENDPOINT points at Supabase Storage, R2 or MinIO; leaving it
    unset talks to AWS itself. Path-style addressing is required by
    everything except AWS, and harmless there.
    """
    global _s3_client
    if _s3_client is not None:
        return _s3_client

    import boto3
    from botocore.config import Config

    kwargs = {"region_name": AWS_REGION}
    if S3_ENDPOINT:
        kwargs["endpoint_url"] = S3_ENDPOINT
        kwargs["config"] = Config(s3={"addressing_style": "path"})
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY

    _s3_client = boto3.client("s3", **kwargs)
    return _s3_client


@contextmanager
def download_to_tempfile(storage_key: str, suffix: str = ""):
    """Yields a local path to the object, cleaning up afterwards."""
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        if STORAGE_DRIVER == "s3":
            _client().download_file(AWS_S3_BUCKET, storage_key, path)
        else:
            source = os.path.join(os.path.abspath(STORAGE_DIR), storage_key)
            if not os.path.exists(source):
                raise FileNotFoundError(f"No object at {source}")
            shutil.copyfile(source, path)
        yield path
    finally:
        os.unlink(path)