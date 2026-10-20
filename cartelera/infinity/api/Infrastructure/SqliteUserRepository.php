<?php
declare(strict_types=1);

namespace Cartelera\Infrastructure;

use Cartelera\Domain\User;
use PDO;

final class SqliteUserRepository
{
    public function __construct(private readonly PDO $connection)
    {
    }

    public function findByIdentity(string $identity): ?array
    {
        $statement = $this->connection->prepare(
            'SELECT id, username, email, password_hash FROM users
             WHERE username = :identity OR email = :identity LIMIT 1'
        );
        $statement->execute(['identity' => $identity]);
        $user = $statement->fetch();

        return $user === false ? null : $user;
    }

    public function findById(int $id): ?User
    {
        $statement = $this->connection->prepare('SELECT id, username, email FROM users WHERE id = :id');
        $statement->execute(['id' => $id]);
        $user = $statement->fetch();

        return $user === false ? null : $this->toUser($user);
    }

    public function create(string $username, string $email, string $passwordHash): User
    {
        $statement = $this->connection->prepare(
            'INSERT INTO users (username, email, password_hash) VALUES (:username, :email, :password_hash)'
        );
        $statement->execute([
            'username' => $username,
            'email' => $email,
            'password_hash' => $passwordHash,
        ]);

        return new User((int) $this->connection->lastInsertId(), $username, $email);
    }

    private function toUser(array $row): User
    {
        return new User((int) $row['id'], $row['username'], $row['email']);
    }
}
