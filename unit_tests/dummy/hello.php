<?php

header( 'Access-Control-Allow-Origin: *' );
header( "Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}" );

$get  = filter_input( INPUT_GET , 'name', FILTER_SANITIZE_STRING );
$post = filter_input( INPUT_POST, 'name', FILTER_SANITIZE_STRING );
$name = 'World';

if ( isset( $get  ) ) $name = $get;
if ( isset( $post ) ) $name = $post;

$response = 'Hello, <b>' . $name . '</b>!';

$callback = filter_input( INPUT_GET, 'callback', FILTER_SANITIZE_STRING );
if ( isset( $callback ) ) $response = $callback . '("' . $response . '");';

echo $response;

?>