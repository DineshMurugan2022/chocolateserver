import type { Request } from 'express';
import type { IUser } from '../models/User.js';

export type AuthRequest<
  TBody = unknown,
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>
> = Request<TParams, unknown, TBody, TQuery> & { user?: IUser };
