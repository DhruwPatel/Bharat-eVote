#!/usr/bin/env perl
# =====================================================================
# Bharat eVote — dependency-free static preview server
# Usage:  perl tools/serve.pl [port]     (default 4173)
# ---------------------------------------------------------------------
# The frontend is static HTML/CSS/JS, so any static host works. This
# script exists so the project can be previewed on a machine without
# Node, Python or PHP installed.
# =====================================================================
use strict;
use warnings;
use IO::Socket::INET;
use File::Basename qw(dirname);
use Cwd qw(abs_path);

$SIG{PIPE} = 'IGNORE';

my $port = shift(@ARGV) // 4173;
my $root = abs_path(dirname(__FILE__) . '/..');

my %MIME = (
  html => 'text/html; charset=utf-8',
  htm  => 'text/html; charset=utf-8',
  css  => 'text/css; charset=utf-8',
  js   => 'text/javascript; charset=utf-8',
  json => 'application/json; charset=utf-8',
  svg  => 'image/svg+xml',
  png  => 'image/png',
  jpg  => 'image/jpeg',
  jpeg => 'image/jpeg',
  webp => 'image/webp',
  ico  => 'image/x-icon',
  txt  => 'text/plain; charset=utf-8',
  map  => 'application/json; charset=utf-8',
);

my $server = IO::Socket::INET->new(
  LocalAddr => '127.0.0.1',
  LocalPort => $port,
  Proto     => 'tcp',
  Listen    => 32,
  ReuseAddr => 1,
) or die "Cannot listen on 127.0.0.1:$port — $!\n";

print "Bharat eVote preview: http://localhost:$port/\n";
print "Serving $root\n";
print "PID $$\n";
$| = 1;

sub respond {
  my ($client, $status, $type, $body, $extra) = @_;
  my $reason = $status == 200 ? 'OK' : $status == 404 ? 'Not Found' : 'Forbidden';
  print $client "HTTP/1.1 $status $reason\r\n";
  print $client "Content-Type: $type\r\n";
  print $client "Content-Length: " . length($body) . "\r\n";
  print $client "Cache-Control: no-store\r\n";
  print $client "Connection: close\r\n";
  print $client ($extra || '') . "\r\n";
  print $client $body;
  close $client;
}

while (my $client = $server->accept) {
  $client->autoflush(1);
  binmode $client;

  my $request_line = <$client>;
  next unless defined $request_line;
  my ($method, $target) = $request_line =~ m{^([A-Z]+)\s+(\S+)};
  # Drain headers.
  while (my $line = <$client>) { last if $line =~ /^\r?\n$/; }

  next unless $method;
  if ($method ne 'GET' && $method ne 'HEAD') {
    respond($client, 403, 'text/plain; charset=utf-8', "Method not allowed\n");
    next;
  }

  $target =~ s/[?#].*$//;
  $target =~ s/%([0-9a-fA-F]{2})/chr(hex($1))/ge;
  $target = '/' if $target eq '';
  $target .= '/index.html' if $target =~ m{/$};
  $target .= '.html' if $target !~ m{\.[a-z0-9]+$}i && -f "$root$target.html";

  if ($target =~ m{\.\.}) {
    respond($client, 403, 'text/plain; charset=utf-8', "Forbidden\n");
    next;
  }

  my $file = $root . $target;
  unless (-f $file) {
    respond($client, 404, 'text/html; charset=utf-8',
      "<!doctype html><meta charset='utf-8'><title>Not found</title>"
      . "<body style='font-family:system-ui;padding:48px;color:#1a2333'>"
      . "<h1 style='font-size:20px'>404 — Page not found</h1>"
      . "<p style='color:#697586'><code>$target</code> does not exist in this project.</p>"
      . "<p><a href='/index.html' style='color:#dd6608'>Back to Bharat eVote</a></p></body>");
    next;
  }

  (my $ext = $file) =~ s{.*\.}{};
  my $type = $MIME{lc $ext} || 'application/octet-stream';

  open(my $fh, '<:raw', $file) or do {
    respond($client, 403, 'text/plain; charset=utf-8', "Cannot read file\n");
    next;
  };
  local $/;
  my $body = <$fh>;
  close $fh;
  $body = '' unless defined $body;

  respond($client, 200, $type, $method eq 'HEAD' ? '' : $body);
}

close $server;
