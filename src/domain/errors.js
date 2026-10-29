export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

export class GameRuleError extends AppError {
  constructor(message) { super(message, 400); }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Please log in to do that.') { super(message, 401); }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.") { super(message, 403); }
}

export class NotFoundError extends AppError {
  constructor(message = 'Page not found.') { super(message, 404); }
}