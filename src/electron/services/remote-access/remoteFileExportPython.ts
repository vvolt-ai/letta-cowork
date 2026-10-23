/** Fixed trusted helper, not generated from model text. POSIX openat traversal
 * pins every directory and rejects links at every component. Python is an
 * explicit host prerequisite; there is no weaker Node/pathname fallback. */
export const REMOTE_FILE_EXPORT_PYTHON = String.raw`
import os, sys, json, stat, base64, hashlib

def main():
    if os.name != 'posix' or os.open not in os.supports_dir_fd or not hasattr(os, 'O_NOFOLLOW') or not hasattr(os, 'O_DIRECTORY'):
        raise ValueError('REMOTE_FILE_SECURE_PLATFORM_UNSUPPORTED')
    raw = sys.stdin.buffer.read(32769)
    if len(raw) > 32768:
        raise ValueError('REMOTE_FILE_PATH_INVALID')
    request = json.loads(raw)
    root, relative = request['root'], request['relative']
    if not os.path.isabs(root) or os.path.isabs(relative):
        raise ValueError('REMOTE_FILE_PATH_INVALID')
    parts = root.split('/') + relative.split('/')
    if any(part in ('.', '..') or '\x00' in part for part in parts):
        raise ValueError('REMOTE_FILE_PATH_INVALID')
    roots = [part for part in root.split('/') if part]
    targets = relative.split('/')
    if not targets or any(not part for part in targets):
        raise ValueError('REMOTE_FILE_PATH_INVALID')
    directory = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    filefd = None
    try:
        for part in roots + targets[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        filefd = os.open(targets[-1], os.O_RDONLY | os.O_NOFOLLOW | getattr(os, 'O_NONBLOCK', 0), dir_fd=directory)
        before = os.fstat(filefd)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError('REMOTE_FILE_REGULAR_FILE_REQUIRED')
        if before.st_size < 0 or before.st_size > 10 * 1024 * 1024:
            raise ValueError('REMOTE_FILE_TOO_LARGE')
        remaining = before.st_size
        chunks = []
        while remaining:
            chunk = os.read(filefd, min(262144, remaining))
            if not chunk:
                raise ValueError('REMOTE_FILE_CHANGED')
            chunks.append(chunk)
            remaining -= len(chunk)
        after = os.fstat(filefd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise ValueError('REMOTE_FILE_CHANGED')
        content = b''.join(chunks)
        json.dump(dict(version=1, fileName=targets[-1], size=len(content), sha256=hashlib.sha256(content).hexdigest(), base64=base64.b64encode(content).decode('ascii')), sys.stdout, separators=(',', ':'))
    finally:
        if filefd is not None:
            os.close(filefd)
        os.close(directory)

try:
    main()
except ValueError as error:
    sys.stderr.write(str(error) if str(error).startswith('REMOTE_FILE_') else 'REMOTE_FILE_PATH_INVALID')
    sys.exit(1)
except Exception:
    sys.stderr.write('REMOTE_FILE_SECURE_READ_DENIED')
    sys.exit(1)
`;
