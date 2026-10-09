<?php
// config/database.php - PDO Database Connection (Smart Auto-Detection for Local XAMPP & InfinityFree)

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(): PDO {
        if (self::$instance !== null && php_sapi_name() === 'cli') {
            try {
                @self::$instance->query('SELECT 1');
            } catch (Throwable $t) {
                self::$instance = null;
            }
        }

        if (self::$instance === null) {
            $isLive = (isset($_SERVER['HTTP_HOST']) && (strpos($_SERVER['HTTP_HOST'], 'infinityfree') !== false || strpos($_SERVER['HTTP_HOST'], 'epizy') !== false));

            if ($isLive) {
                // InfinityFree Production Settings
                $host = getenv('DB_HOST') ?: 'sql310.epizy.com';
                $port = getenv('DB_PORT') ?: '3306';
                $dbname = getenv('DB_NAME') ?: 'if0_43123386_anasnimca';
                $username = getenv('DB_USER') ?: 'if0_43123386';
                $password = getenv('DB_PASS') !== false ? getenv('DB_PASS') : 'ZeFzpSPf25eE';
            } else {
                // Local XAMPP Development Settings
                $host = getenv('DB_HOST') ?: '127.0.0.1';
                $port = getenv('DB_PORT') ?: '3306';
                $dbname = getenv('DB_NAME') ?: 'an_chat_db';
                $username = getenv('DB_USER') ?: 'root';
                $password = getenv('DB_PASS') !== false ? getenv('DB_PASS') : '';
            }

            $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
            
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, time_zone = '+03:00'"
            ];

            try {
                self::$instance = new PDO($dsn, $username, $password, $options);
            } catch (PDOException $e) {
                if (defined('API_REQUEST') || (isset($_SERVER['CONTENT_TYPE']) && strpos($_SERVER['CONTENT_TYPE'], 'application/json') !== false)) {
                    header('Content-Type: application/json; charset=utf-8');
                    http_response_code(500);
                    echo json_encode([
                        'success' => false,
                        'message' => 'Database connection failed: ' . $e->getMessage()
                    ]);
                    exit;
                }
                if (php_sapi_name() === 'cli') {
                    throw $e;
                }
                die("Database connection error: " . htmlspecialchars($e->getMessage()) . "<br><br>Host: {$host} | Database: {$dbname} | User: {$username}");
            }
        }

        return self::$instance;
    }
}
