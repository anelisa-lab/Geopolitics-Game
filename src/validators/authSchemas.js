import { z } from 'zod';

export const signupSchema = z
  .object({
    username: z.string().trim()
      .min(3, 'Username must be at least 3 characters.')
      .max(20, 'Username can be at most 20 characters.')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only use letters, numbers and _.'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters.')
      .max(72, 'Password can be at most 72 characters.')
      .regex(/[A-Za-z]/, 'Password needs at least one letter.')
      .regex(/[0-9]/, 'Password needs at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
});