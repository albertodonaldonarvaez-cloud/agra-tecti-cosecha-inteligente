INSERT INTO users (email, password, name, role, createdAt, updatedAt, lastSignedIn)
VALUES (
  'admin@agratec.com',
  '$2a$10$YQs8qF0xvN0YhF5h5h5h5uO5h5h5h5h5h5h5h5h5h5h5h5h5h5h5',
  'Administrador',
  'admin',
  NOW(),
  NOW(),
  NOW()
);
