<?php
declare(strict_types=1);

namespace Cartelera\Infrastructure;

use PDO;

final class SqliteDatabase
{
    private ?PDO $connection = null;

    public function __construct(private readonly string $path)
    {
    }

    public function connection(): PDO
    {
        if ($this->connection !== null) {
            return $this->connection;
        }

        $directory = dirname($this->path);
        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
            throw new \RuntimeException('No se pudo crear el directorio de la base de datos.');
        }

        $this->connection = new PDO('sqlite:' . $this->path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $this->connection->exec('PRAGMA foreign_keys = ON');
        $this->connection->exec('PRAGMA busy_timeout = 5000');
        $this->migrate($this->connection);

        return $this->connection;
    }

    private function migrate(PDO $connection): void
    {
        $connection->exec(
            'CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )'
        );
        $connection->exec(
            'CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN (\'movie\', \'series\', \'video\')),
                year INTEGER,
                genre TEXT,
                description TEXT,
                link_url TEXT NOT NULL,
                poster_url TEXT,
                views_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )'
        );
        $postColumns = $connection->query('PRAGMA table_info(posts)')->fetchAll();
        if (!in_array('views_count', array_column($postColumns, 'name'), true)) {
            $connection->exec('ALTER TABLE posts ADD COLUMN views_count INTEGER NOT NULL DEFAULT 0');
        }
        $connection->exec(
            'CREATE TABLE IF NOT EXISTS post_likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, user_id)
            )'
        );
        $connection->exec(
            'CREATE TABLE IF NOT EXISTS post_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                review TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, user_id)
            )'
        );
        $connection->exec(
            'CREATE TABLE IF NOT EXISTS post_episodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                season_number INTEGER NOT NULL CHECK (season_number >= 1),
                episode_number INTEGER NOT NULL CHECK (episode_number >= 1),
                title TEXT,
                link_url TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, season_number, episode_number)
            )'
        );
        $connection->exec(
            'CREATE TABLE IF NOT EXISTS post_subtitles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                target_key TEXT NOT NULL,
                original_name TEXT NOT NULL,
                format TEXT NOT NULL,
                content BLOB NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(post_id, target_key)
            )'
        );
        $connection->exec('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC, id DESC)');
        $connection->exec('CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type)');
        $connection->exec('CREATE INDEX IF NOT EXISTS idx_likes_post ON post_likes(post_id)');
        $connection->exec('CREATE INDEX IF NOT EXISTS idx_reviews_post ON post_reviews(post_id)');
        $connection->exec('CREATE INDEX IF NOT EXISTS idx_episodes_post ON post_episodes(post_id, season_number, episode_number)');
        $connection->exec('CREATE INDEX IF NOT EXISTS idx_subtitles_post ON post_subtitles(post_id, target_key)');
    }
}
