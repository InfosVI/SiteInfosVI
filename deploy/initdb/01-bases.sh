#!/bin/sh
# Premier démarrage de PostgreSQL : une base et un compte par application, chacun limité à sa base.
set -e
psql -v ON_ERROR_STOP=1 --username postgres <<SQL
CREATE ROLE site LOGIN PASSWORD '${MDP_BASE_SITE}';
CREATE DATABASE site OWNER site;
CREATE ROLE apercu LOGIN PASSWORD '${MDP_BASE_APERCU}';
CREATE DATABASE apercu OWNER apercu;
CREATE ROLE stats LOGIN PASSWORD '${MDP_BASE_STATS:-changer-moi}';
CREATE DATABASE stats OWNER stats;
REVOKE ALL ON DATABASE site FROM PUBLIC;
REVOKE ALL ON DATABASE stats FROM PUBLIC;
REVOKE ALL ON DATABASE apercu FROM PUBLIC;
SQL
