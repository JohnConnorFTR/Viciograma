<?php
declare(strict_types=1);

namespace Cartelera\Infrastructure;

use Cartelera\Domain\MediaPost;
use PDO;

final class SqlitePostRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function search(?string $query, ?string $type, ?int $viewerId = null): array
    {
        $conditions = [];
        $parameters = [];

        if ($type !== null) {
            $conditions[] = 'p.type = :type';
            $parameters['type'] = $type;
        }
        if ($query !== null && $query !== '') {
            $conditions[] = '(p.title LIKE :title_query OR p.genre LIKE :genre_query OR p.description LIKE :description_query OR u.username LIKE :username_query)';
            $likeQuery = '%' . $query . '%';
            $parameters['title_query'] = $likeQuery;
            $parameters['genre_query'] = $likeQuery;
            $parameters['description_query'] = $likeQuery;
            $parameters['username_query'] = $likeQuery;
        }

        $where = $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
        $statement = $this->connection->prepare(
            'SELECT p.id, p.user_id, p.title, p.type, p.year, p.genre, p.description,
                    p.link_url, p.poster_url, p.views_count, p.created_at, u.username,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
                    (SELECT AVG(pr.rating) FROM post_reviews pr WHERE pr.post_id = p.id) AS rating_average,
                    (SELECT COUNT(*) FROM post_reviews pr WHERE pr.post_id = p.id) AS review_count,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = :viewer_id) AS liked_by_me,
                    (SELECT COUNT(DISTINCT pe.season_number) FROM post_episodes pe WHERE pe.post_id = p.id) AS season_count
             FROM posts p JOIN users u ON u.id = p.user_id
             ' . $where . '
             ORDER BY p.created_at DESC, p.id DESC
             LIMIT 200'
        );
        $statement->execute(['viewer_id' => $viewerId ?? 0] + $parameters);

        return array_map(
            fn (array $row): MediaPost => $this->toPost($row),
            $statement->fetchAll()
        );
    }

    public function create(int $userId, array $data): MediaPost
    {
        $this->connection->beginTransaction();
        try {
        $statement = $this->connection->prepare(
            'INSERT INTO posts (user_id, title, type, year, genre, description, link_url, poster_url)
             VALUES (:user_id, :title, :type, :year, :genre, :description, :link_url, :poster_url)'
        );
        $statement->execute([
            'user_id' => $userId,
            'title' => $data['title'],
            'type' => $data['type'],
            'year' => $data['year'],
            'genre' => $data['genre'],
            'description' => $data['description'],
            'link_url' => $data['link_url'],
            'poster_url' => $data['poster_url'],
        ]);

        $newId = (int) $this->connection->lastInsertId();
        $this->saveEpisodes($newId, $data['episodes'] ?? []);

        $statement = $this->connection->prepare(
            'SELECT p.id, p.user_id, p.title, p.type, p.year, p.genre, p.description,
                    p.link_url, p.poster_url, p.views_count, p.created_at, u.username,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
                    (SELECT AVG(pr.rating) FROM post_reviews pr WHERE pr.post_id = p.id) AS rating_average,
                    (SELECT COUNT(*) FROM post_reviews pr WHERE pr.post_id = p.id) AS review_count,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = :viewer_id) AS liked_by_me,
                    (SELECT COUNT(DISTINCT pe.season_number) FROM post_episodes pe WHERE pe.post_id = p.id) AS season_count
             FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = :id'
        );
        $statement->execute(['id' => $newId, 'viewer_id' => $userId]);
        $row = $statement->fetch();

        if ($row === false) {
            throw new \RuntimeException('No se pudo recuperar la publicación creada.');
        }

        $this->connection->commit();
        return $this->toPost($row);
        } catch (\Throwable $exception) {
            if ($this->connection->inTransaction()) {
                $this->connection->rollBack();
            }
            throw $exception;
        }
    }

    public function update(int $postId, int $userId, array $data): MediaPost
    {
        $ownership = $this->connection->prepare('SELECT 1 FROM posts WHERE id = :id AND user_id = :user_id');
        $ownership->execute(['id' => $postId, 'user_id' => $userId]);
        if (!$ownership->fetchColumn()) {
            throw new \InvalidArgumentException('No se encontró una publicación tuya con ese identificador.');
        }

        $this->connection->beginTransaction();
        try {
        $statement = $this->connection->prepare(
            'UPDATE posts SET title = :title, type = :type, year = :year, genre = :genre, description = :description, link_url = :link_url, poster_url = :poster_url WHERE id = :id AND user_id = :user_id'
        );
        $statement->execute([
            'id' => $postId,
            'user_id' => $userId,
            'title' => $data['title'],
            'type' => $data['type'],
            'year' => $data['year'],
            'genre' => $data['genre'],
            'description' => $data['description'],
            'link_url' => $data['link_url'],
            'poster_url' => $data['poster_url'],
        ]);
        $this->saveEpisodes($postId, $data['episodes'] ?? []);

        $statement = $this->connection->prepare(
            'SELECT p.id, p.user_id, p.title, p.type, p.year, p.genre, p.description,
                    p.link_url, p.poster_url, p.views_count, p.created_at, u.username,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
                    (SELECT AVG(pr.rating) FROM post_reviews pr WHERE pr.post_id = p.id) AS rating_average,
                    (SELECT COUNT(*) FROM post_reviews pr WHERE pr.post_id = p.id) AS review_count,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = :viewer_id) AS liked_by_me,
                    (SELECT COUNT(DISTINCT pe.season_number) FROM post_episodes pe WHERE pe.post_id = p.id) AS season_count
             FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = :id'
        );
        $statement->execute(['id' => $postId, 'viewer_id' => $userId]);
        $row = $statement->fetch();

        if ($row === false) {
            throw new \RuntimeException('No se pudo recuperar la publicación actualizada.');
        }

        $this->connection->commit();
        return $this->toPost($row);
        } catch (\Throwable $exception) {
            if ($this->connection->inTransaction()) {
                $this->connection->rollBack();
            }
            throw $exception;
        }
    }

    public function delete(int $postId, int $userId): bool
    {
        $statement = $this->connection->prepare('DELETE FROM posts WHERE id = :id AND user_id = :user_id');
        $statement->execute(['id' => $postId, 'user_id' => $userId]);

        return $statement->rowCount() > 0;
    }

    public function findById(int $postId): ?array
    {
        $statement = $this->connection->prepare(
            'SELECT p.id, p.user_id, p.title, p.type, p.year, p.genre, p.description,
                    p.link_url, p.poster_url, p.views_count, p.created_at, u.username,
                    (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
                    (SELECT AVG(pr.rating) FROM post_reviews pr WHERE pr.post_id = p.id) AS rating_average,
                    (SELECT COUNT(*) FROM post_reviews pr WHERE pr.post_id = p.id) AS review_count,
                    0 AS liked_by_me
             FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = :id'
        );
        $statement->execute(['id' => $postId]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function reviewsForPost(int $postId): array
    {
        $statement = $this->connection->prepare(
            'SELECT u.username, pr.rating, pr.review, pr.created_at
             FROM post_reviews pr
             JOIN users u ON u.id = pr.user_id
             WHERE pr.post_id = :post_id
             ORDER BY pr.created_at DESC, pr.id DESC'
        );
        $statement->execute(['post_id' => $postId]);

        return $statement->fetchAll();
    }

    public function episodesForPost(int $postId): array
    {
        $statement = $this->connection->prepare(
            'SELECT season_number, episode_number, title, link_url
             FROM post_episodes
             WHERE post_id = :post_id
             ORDER BY season_number, episode_number'
        );
        $statement->execute(['post_id' => $postId]);

        return $statement->fetchAll();
    }

    public function ownsPost(int $postId, int $userId): bool
    {
        $statement = $this->connection->prepare('SELECT 1 FROM posts WHERE id = :post_id AND user_id = :user_id');
        $statement->execute(['post_id' => $postId, 'user_id' => $userId]);

        return $statement->fetchColumn() !== false;
    }

    public function episodeExists(int $postId, int $seasonNumber, int $episodeNumber): bool
    {
        $statement = $this->connection->prepare(
            'SELECT 1 FROM post_episodes WHERE post_id = :post_id AND season_number = :season_number AND episode_number = :episode_number'
        );
        $statement->execute([
            'post_id' => $postId,
            'season_number' => $seasonNumber,
            'episode_number' => $episodeNumber,
        ]);

        return $statement->fetchColumn() !== false;
    }

    public function saveSubtitle(int $postId, string $targetKey, string $originalName, string $format, string $content): int
    {
        $statement = $this->connection->prepare(
            'INSERT INTO post_subtitles (post_id, target_key, original_name, format, content)
             VALUES (:post_id, :target_key, :original_name, :format, :content)
             ON CONFLICT(post_id, target_key) DO UPDATE SET
                original_name = excluded.original_name,
                format = excluded.format,
                content = excluded.content,
                created_at = CURRENT_TIMESTAMP'
        );
        $statement->bindValue(':post_id', $postId, PDO::PARAM_INT);
        $statement->bindValue(':target_key', $targetKey, PDO::PARAM_STR);
        $statement->bindValue(':original_name', $originalName, PDO::PARAM_STR);
        $statement->bindValue(':format', $format, PDO::PARAM_STR);
        $statement->bindValue(':content', $content, PDO::PARAM_LOB);
        $statement->execute();

        $lookup = $this->connection->prepare(
            'SELECT id FROM post_subtitles WHERE post_id = :post_id AND target_key = :target_key'
        );
        $lookup->execute(['post_id' => $postId, 'target_key' => $targetKey]);

        return (int) $lookup->fetchColumn();
    }

    public function subtitlesForPost(int $postId): array
    {
        $statement = $this->connection->prepare(
            'SELECT id, target_key, original_name, format
             FROM post_subtitles WHERE post_id = :post_id ORDER BY target_key'
        );
        $statement->execute(['post_id' => $postId]);

        return $statement->fetchAll();
    }

    public function subtitleById(int $subtitleId): ?array
    {
        $statement = $this->connection->prepare(
            'SELECT original_name, format, content FROM post_subtitles WHERE id = :id'
        );
        $statement->execute(['id' => $subtitleId]);
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }

    public function registerView(int $postId): int
    {
        $statement = $this->connection->prepare(
            'UPDATE posts SET views_count = views_count + 1 WHERE id = :id'
        );
        $statement->execute(['id' => $postId]);
        if ($statement->rowCount() === 0) {
            throw new \InvalidArgumentException('No se encontró la publicación.');
        }

        $statement = $this->connection->prepare('SELECT views_count FROM posts WHERE id = :id');
        $statement->execute(['id' => $postId]);

        return (int) $statement->fetchColumn();
    }

    public function toggleLike(int $postId, int $userId): array
    {
        $exists = $this->connection->prepare('SELECT 1 FROM post_likes WHERE post_id = :post_id AND user_id = :user_id LIMIT 1');
        $exists->execute(['post_id' => $postId, 'user_id' => $userId]);

        if ($exists->fetch()) {
            $this->connection->prepare('DELETE FROM post_likes WHERE post_id = :post_id AND user_id = :user_id')->execute([
                'post_id' => $postId,
                'user_id' => $userId,
            ]);
            $liked = false;
        } else {
            $this->connection->prepare('INSERT INTO post_likes (post_id, user_id) VALUES (:post_id, :user_id)')->execute([
                'post_id' => $postId,
                'user_id' => $userId,
            ]);
            $liked = true;
        }

        $post = $this->findById($postId);
        if ($post === null) {
            throw new \RuntimeException('La publicación no existe.');
        }

        return [
            'liked' => $liked,
            'likes_count' => (int) ($post['likes_count'] ?? 0) + ($liked ? 1 : -1),
            'rating_average' => (float) ($post['rating_average'] ?? 0.0),
            'review_count' => (int) ($post['review_count'] ?? 0),
        ];
    }

    public function saveReview(int $postId, int $userId, int $rating, ?string $review): array
    {
        $statement = $this->connection->prepare(
            'INSERT INTO post_reviews (post_id, user_id, rating, review) VALUES (:post_id, :user_id, :rating, :review)
             ON CONFLICT(post_id, user_id) DO UPDATE SET rating = excluded.rating, review = excluded.review'
        );
        $statement->execute([
            'post_id' => $postId,
            'user_id' => $userId,
            'rating' => $rating,
            'review' => $review !== '' ? $review : null,
        ]);

        $post = $this->findById($postId);
        if ($post === null) {
            throw new \RuntimeException('La publicación no existe.');
        }

        return [
            'rating_average' => (float) ($post['rating_average'] ?? 0.0),
            'review_count' => (int) ($post['review_count'] ?? 0),
        ];
    }

    private function toPost(array $row): MediaPost
    {
        return new MediaPost(
            (int) $row['id'],
            (int) $row['user_id'],
            $row['title'],
            $row['type'],
            $row['year'] === null ? null : (int) $row['year'],
            $row['genre'],
            $row['description'],
            $row['link_url'],
            $row['poster_url'],
            $row['created_at'],
            $row['username'],
            (int) ($row['likes_count'] ?? 0),
            (float) ($row['rating_average'] ?? 0.0),
            (int) ($row['review_count'] ?? 0),
            (bool) ((int) ($row['liked_by_me'] ?? 0) > 0),
            (int) ($row['views_count'] ?? 0),
            (int) ($row['season_count'] ?? 0)
        );
    }

    private function saveEpisodes(int $postId, array $episodes): void
    {
        $this->connection->prepare('DELETE FROM post_episodes WHERE post_id = :post_id')
            ->execute(['post_id' => $postId]);

        if ($episodes === []) {
            return;
        }

        $statement = $this->connection->prepare(
            'INSERT INTO post_episodes (post_id, season_number, episode_number, title, link_url)
             VALUES (:post_id, :season_number, :episode_number, :title, :link_url)'
        );
        foreach ($episodes as $episode) {
            $statement->execute([
                'post_id' => $postId,
                'season_number' => $episode['season_number'],
                'episode_number' => $episode['episode_number'],
                'title' => $episode['title'],
                'link_url' => $episode['link_url'],
            ]);
        }
    }
}
