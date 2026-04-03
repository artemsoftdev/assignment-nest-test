# Billing Management API

A secure and scalable user authentication and billing management system built with NestJS, TypeORM, and PostgreSQL. Features role-based access control, fund deposits, transfers between users, and webhook notifications for transactions.

## Tech Stack

- **Backend**: NestJS 11
- **Database**: PostgreSQL 16
- **ORM**: TypeORM
- **Authentication**: JWT (access + refresh tokens stored in cookies)
- **Documentation**: Swagger (OpenAPI)
- **Containerization**: Docker + Docker Compose

## Quick Start with Docker

```bash
# Clone the repository
git clone <repository-url>
cd assignment-nest-test

# Start with Docker Compose
docker-compose up --build
```

The application will be available at `http://localhost:3000`.
Swagger documentation: `http://localhost:3000/api/docs`.

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL 16+

### Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your database credentials and webhook URL

# Start PostgreSQL (or use docker-compose for DB only)
docker-compose up postgres -d

# Run the application
npm run start:dev
```

### Environment Variables

| Variable | Description |
|---|---|
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port |
| `DB_USERNAME` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_NAME` | Database name |
| `JWT_ACCESS_SECRET` | JWT access token secret |
| `JWT_REFRESH_SECRET` | JWT refresh token secret |
| `JWT_ACCESS_EXPIRATION` | Access token TTL |
| `JWT_REFRESH_EXPIRATION` | Refresh token TTL |
| `ADMIN_EMAIL` | Default admin email |
| `ADMIN_PASSWORD` | Default admin password |
| `WEBHOOK_URL` | Webhook URL for transaction events |

## Database Seeding

On application startup, the database is automatically seeded with:
- **Roles**: `admin`, `client`
- **Admin user**: Uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` from environment variables

## API Endpoints

### Auth
| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/auth/register` | Register a new user | Public |
| POST | `/auth/login` | Login | Public |
| POST | `/auth/refresh` | Refresh tokens | Authenticated |
| POST | `/auth/logout` | Logout | Authenticated |

### Users
| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/users` | List all users (paginated) | Admin |
| GET | `/users/profile` | Get own profile | Authenticated |
| GET | `/users/:id` | Get user by ID | Admin |
| PATCH | `/users/:id/block` | Block a user | Admin |
| PATCH | `/users/:id/unblock` | Unblock a user | Admin |
| PATCH | `/users/deactivate` | Deactivate own account | Authenticated |

### Accounts
| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/accounts` | Get own account | Client |
| POST | `/accounts/deposit` | Deposit funds | Client |
| POST | `/accounts/transfer` | Transfer funds | Client |

### Transactions
| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/transactions` | Get own transactions (paginated) | Client |
| GET | `/transactions/all` | Get all transactions (paginated) | Admin |
| GET | `/transactions/:id` | Get transaction by ID | Authenticated |
| PATCH | `/transactions/:id/cancel` | Cancel a transaction | Owner / Admin |

## Roles & Permissions

- **Admin**: Manage users (view, block/unblock), manage all transactions (view, cancel)
- **Client**: Manage own account (deposit, transfer), view/cancel own transactions

## Webhook

Each transaction (deposit, transfer, cancel) sends a POST request to the configured `WEBHOOK_URL` with the transaction data. Use [webhook.site](https://webhook.site) for testing.

## Swagger Documentation

Available at `/api/docs` when the application is running. Includes all endpoint descriptions, request/response schemas, and examples.
