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

    public function search(?string $query, ?string $type): array
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
                    p.link_url, p.poster_url, p.created_at, u.username
             FROM posts p JOIN users u ON u.id = p.user_id
             ' . $where . '
             ORDER BY p.created_at DESC, p.id DESC
             LIMIT 200'
        );
        $statement->execute($parameters);

        return array_map(
            fn (array $row): MediaPost => $this->toPost($row),
            $statement->fetchAll()
        );
    }

    public function create(int $userId, array $data): MediaPost
    {
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

        $statement = $this->connection->prepare(
            'SELECT p.id, p.user_id, p.title, p.type, p.year, p.genre, p.description,
                    p.link_url, p.poster_url, p.created_at, u.username
             FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = :id'
        );
        $statement->execute(['id' => (int) $this->connection->lastInsertId()]);
        $row = $statement->fetch();

        if ($row === false) {
            throw new \RuntimeException('No se pudo recuperar la publicación creada.');
        }

        return $this->toPost($row);
    }

    public function delete(int $postId, int $userId): bool
    {
        $statement = $this->connection->prepare('DELETE FROM posts WHERE id = :id AND user_id = :user_id');
        $statement->execute(['id' => $postId, 'user_id' => $userId]);

        return $statement->rowCount() > 0;
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
            $row['username']
        );
    }
}
