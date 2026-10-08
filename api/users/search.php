<?php
// api/users/search.php
define('API_REQUEST', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../models/User.php';

$currentUser = requireAuth();

$query = trim($_GET['q'] ?? '');
if (empty($query)) {
    jsonResponse(true, 'Empty query', []);
}

$userModel = new User();
$results = $userModel->search($query, $currentUser['id']);

jsonResponse(true, 'Search results', $results);

