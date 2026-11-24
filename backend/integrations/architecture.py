"""Rule-based split of a repo's file paths into functional groups. Pure, deterministic, no I/O."""
import os
import re
from dataclasses import dataclass, field

# top-level dirs that hold sub-projects/modules: group by root + next-level dir
CONTAINERS = {'backend', 'frontend', 'src', 'app', 'apps', 'packages', 'services', 'lib', 'libs',
              'server', 'client', 'web', 'api', 'cmd', 'internal', 'pkg', 'mobile', 'core'}
# dirs that are themselves just a namespace: keep descending one more level
DEEP = {'src', 'app', 'apps', 'packages', 'components', 'pages', 'modules', 'features', 'lib', 'libs',
        'cmd', 'internal', 'pkg'}
INFRA_DIRS = {'.github', '.gitlab', '.circleci', '.husky', '.vscode', '.devcontainer', 'docker', 'scripts',
              'infra', 'deploy', 'k8s', 'ci', 'terraform', 'helm'}
DOC_DIRS = {'docs', 'doc', 'documentation'}
TEST_DIRS = {'tests', 'test', '__tests__', 'spec', 'specs'}
NOISE_DIRS = {'node_modules', 'dist', 'build', '__pycache__', '.git', '.venv', 'venv', '.next', 'coverage',
              '.idea', '.mypy_cache', '.pytest_cache', 'target'}
LOCK_FILES = {'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'pipfile.lock',
              'cargo.lock', 'composer.lock', 'go.sum', 'uv.lock', 'gemfile.lock'}
BINARY_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.pdf', '.woff', '.woff2', '.ttf',
              '.eot', '.zip', '.gz', '.pyc', '.mp4', '.mp3', '.map', '.exe', '.jar'}
CONFIG_EXT = {'.json', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.env'}
DOC_EXT = {'.md', '.rst', '.txt', '.adoc'}
BACKEND_HINTS = {'backend', 'server', 'api', 'services', 'cmd', 'internal', 'pkg', 'models', 'db', 'worker'}
FRONTEND_HINTS = {'frontend', 'client', 'web', 'components', 'pages', 'ui', 'public', 'styles', 'views', 'mobile'}
BACKEND_EXT = {'.py', '.go', '.java', '.rb', '.rs', '.php', '.kt', '.cs'}
FRONTEND_EXT = {'.tsx', '.jsx', '.vue', '.svelte', '.css', '.scss', '.html'}

SPECIAL = {  # id -> (name, kind)
    'infra-config': ('Infra & Config', 'infra'),
    'docs': ('Docs', 'docs'),
    'root': ('Root', 'other'),
    'tests': ('Tests', 'other'),
    'misc': ('Misc', 'other'),
}


@dataclass
class Group:
    id: str
    name: str
    kind: str
    prefix: tuple = ()
    files: list = field(default_factory=list)

    @property
    def file_count(self):
        return len(self.files)

    @property
    def sample_paths(self):
        cand = [p for p in self.files if 'migrations' not in p.split('/')]
        return sorted(cand, key=lambda p: (p.count('/'), p))[:5]

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'kind': self.kind,
                'fileCount': self.file_count, 'samplePaths': self.sample_paths}


def _is_test_file(name):
    n = name.lower()
    return (n in ('tests.py', 'conftest.py') or n.startswith('test_') or bool(re.search(r'[_.](test|spec)\.\w+$', n)))


def _classify(path):
    """-> ('noise',) | ('special', id) | ('dir', key tuple) | ('test', stem)."""
    parts = [p for p in path.strip('/').split('/') if p]
    if not parts:
        return ('noise',)
    name = parts[-1]
    low = name.lower()
    ext = os.path.splitext(low)[1]
    if (any(s in NOISE_DIRS for s in parts[:-1]) or low in LOCK_FILES or ext in BINARY_EXT
            or low.endswith('.min.js')):
        return ('noise',)
    if low.startswith('dockerfile') or low.startswith('docker-compose') or low.startswith('compose.'):
        return ('special', 'infra-config')
    top = parts[0].lower()
    if len(parts) > 1:
        if top in INFRA_DIRS:
            return ('special', 'infra-config')
        if top in DOC_DIRS:
            return ('special', 'docs')
        if top in TEST_DIRS:  # top-level tests dir: attach by file name
            return ('test', _stem(name))
    else:  # loose root file
        if low.startswith('.') or low in ('makefile', 'procfile') or ext in CONFIG_EXT:
            return ('special', 'infra-config')
        if ext in DOC_EXT or low.startswith(('license', 'readme')):
            return ('special', 'docs')
        if _is_test_file(name):
            return ('test', _stem(name))
        return ('special', 'root')
    dirs = [p for p in parts[:-1] if p.lower() not in TEST_DIRS]  # tests/ dirs inside a group belong to it
    if not dirs:
        return ('special', 'root')
    key = [dirs[0]]
    if dirs[0].lower() in CONTAINERS and len(dirs) > 1:
        key.append(dirs[1])
        while key[-1].lower() in DEEP and len(dirs) > len(key):
            key.append(dirs[len(key)])
    return ('dir', tuple(key))


def _stem(name):
    s = os.path.splitext(name.lower())[0]
    s = re.sub(r'\.(test|spec)$', '', s)
    s = re.sub(r'^test_|_test$|^tests?$', '', s)
    return s


def _match_test(stem, dir_groups):
    best = None
    for g in dir_groups:
        seg = g.prefix[-1].lower()
        if stem and seg in stem and (best is None or len(seg) > len(best.prefix[-1])):
            best = g
    return best


def _slug(key):
    return re.sub(r'[^a-z0-9]+', '-', '-'.join(key).lower()).strip('-')


def _name(key):
    segs = [s for s in key if s.lower() not in ('src', 'app')] or list(key)
    return ' / '.join(re.sub(r'[_-]+', ' ', s).title() for s in segs)


def _kind(prefix, files):
    segs = {s.lower() for s in prefix}
    if segs & FRONTEND_HINTS:
        return 'frontend'
    if segs & BACKEND_HINTS:
        return 'backend'
    exts = [os.path.splitext(f)[1].lower() for f in files]
    fe = sum(e in FRONTEND_EXT or e in ('.ts', '.js') for e in exts)
    be = sum(e in BACKEND_EXT for e in exts)
    return 'frontend' if fe > be else 'backend' if be else 'other'


def group_paths(paths):
    dirs, special, tests = {}, {}, []
    for p in sorted(set(paths)):
        c = _classify(p)
        if c[0] == 'dir':
            dirs.setdefault(c[1], []).append(p)
        elif c[0] == 'special':
            special.setdefault(c[1], []).append(p)
        elif c[0] == 'test':
            tests.append((c[1], p))

    # merge tiny (<2 files) groups into nearest existing parent prefix, else Misc (deepest first)
    for key in sorted(dirs, key=len, reverse=True):
        if len(dirs[key]) >= 2:
            continue
        files = dirs.pop(key)
        for i in range(len(key) - 1, 0, -1):
            if key[:i] in dirs:
                dirs[key[:i]].extend(files)
                break
        else:
            special.setdefault('misc', []).extend(files)

    groups = [Group(_slug(k), _name(k), _kind(k, f), k, f) for k, f in dirs.items()]
    dir_groups = list(groups)
    for stem, p in tests:
        g = _match_test(stem, dir_groups)
        if g:
            g.files.append(p)
        else:
            special.setdefault('tests', []).append(p)
    for sid, files in special.items():
        name, kind = SPECIAL[sid]
        groups.append(Group(sid, name, kind, (), files))
    for g in groups:
        g.files.sort()
    return sorted(groups, key=lambda g: (-g.file_count, g.id))


class Locator:
    """Maps any path (even ones absent from the current tree, e.g. deleted files) to a group id or None."""

    def __init__(self, groups):
        self.groups = groups
        self.by_file = {p: g.id for g in groups for p in g.files}
        self.by_prefix = {g.prefix: g for g in groups if g.prefix}
        self.dir_groups = list(self.by_prefix.values())
        self.ids = {g.id for g in groups}

    def __call__(self, path):
        if path in self.by_file:
            return self.by_file[path]
        c = _classify(path)
        if c[0] == 'noise':
            return None
        if c[0] == 'dir':
            for i in range(len(c[1]), 0, -1):
                if c[1][:i] in self.by_prefix:
                    return self.by_prefix[c[1][:i]].id
        elif c[0] == 'test':
            g = _match_test(c[1], self.dir_groups)
            if g:
                return g.id
            if 'tests' in self.ids:
                return 'tests'
        elif c[1] in self.ids:
            return c[1]
        return 'misc' if 'misc' in self.ids else None
