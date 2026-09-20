"""Mirror of the Node storage layer: same keys, same two drivers."""
import os
import shutil
import tempfile
from contextlib import contextmanager

from app.config import STORAGE_DRIVER, STORAGE_DIR, AWS_REGION, AWS_S3_BUCKET


@contextmanager
def download_to_tempfile(storage_key: str, suffix: str = ""):
    """Yields a local path to the object, cleaning up afterwards."""
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        if STORAGE_DRIVER == "s3":
            import boto3

            boto3.client("s3", region_name=AWS_REGION).download_file(
                AWS_S3_BUCKET, storage_key, path
            )
        else:
            source = os.path.join(os.path.abspath(STORAGE_DIR), storage_key)
            if not os.path.exists(source):
                raise FileNotFoundError(f"No object at {source}")
            shutil.copyfile(source, path)
        yield path
    finally:
        os.unlink(path)
