import type { Request } from 'express';
import type { User } from '../entities/user.entity.js';

export interface RequestWithUser extends Request {
  user: User;
}
