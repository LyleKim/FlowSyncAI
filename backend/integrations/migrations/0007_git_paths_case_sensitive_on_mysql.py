from django.db import migrations

# Git paths are case-sensitive ('Docs' != 'docs'), but MySQL 8's default utf8mb4_0900_ai_ci
# compares case- and accent-insensitively, which made the (repo, path) unique keys collide.
# SQLite/Postgres already compare these columns byte-wise, so this only touches MySQL.
COLUMNS = [('integrations_folderdescription', 'path'), ('integrations_areaalias', 'path_prefix')]


def to_bin(apps, schema_editor):
    if schema_editor.connection.vendor == 'mysql':
        for table, col in COLUMNS:
            schema_editor.execute(
                f'ALTER TABLE `{table}` MODIFY `{col}` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL')


def to_default(apps, schema_editor):
    if schema_editor.connection.vendor == 'mysql':
        for table, col in COLUMNS:
            schema_editor.execute(f'ALTER TABLE `{table}` MODIFY `{col}` varchar(300) NOT NULL')


class Migration(migrations.Migration):
    atomic = False  # MySQL DDL cannot run inside a transaction
    dependencies = [('integrations', '0006_watchedrepo_describe_started_at')]
    operations = [migrations.RunPython(to_bin, to_default)]
