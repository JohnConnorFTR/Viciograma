<?php
declare(strict_types=1);

namespace Cartelera\Application;

use Cartelera\Domain\User;
use Cartelera\Infrastructure\SqliteUserRepository;
use PDOException;

final class AuthService
{
    public function __construct(private readonly SqliteUserRepository $users)
    {
    }

    public function register(array $input): User
    {
        $username = trim((string) ($input['username'] ?? ''));
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');

        if (!preg_match('/^[\p{L}\p{N}_-]{3,24}$/u', $username)) {
            throw new \InvalidArgumentException('El usuario debe tener entre 3 y 24 caracteres: letras, números, guion o guion bajo.');
        }
        if (strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new \InvalidArgumentException('Ingresá un email válido.');
        }
        if (strlen($password) < 10 || strlen($password) > 4096) {
            throw new \InvalidArgumentException('La contraseña debe tener al menos 10 caracteres.');
        }

        try {
            return $this->users->create($username, $email, password_hash($password, PASSWORD_DEFAULT));
        } catch (PDOException $exception) {
            if ((string) $exception->getCode() === '23000') {
                throw new \InvalidArgumentException('Ese nombre de usuario o email ya está registrado.');
            }
            throw $exception;
        }
    }

    public function login(array $input): User
    {
        $identity = trim((string) ($input['identity'] ?? ''));
        $password = (string) ($input['password'] ?? '');
        $record = $this->users->findByIdentity($identity);

        if ($record === null || !password_verify($password, $record['password_hash'])) {
            throw new \InvalidArgumentException('El usuario/email o la contraseña no son correctos.');
        }

        return new User((int) $record['id'], $record['username'], $record['email']);
    }
}
