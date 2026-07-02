-- Runs once when the lifty-dev-pg volume is first created.
-- The dev database ("lifty") comes from POSTGRES_DB; tests get their own.
CREATE DATABASE lifty_test;
