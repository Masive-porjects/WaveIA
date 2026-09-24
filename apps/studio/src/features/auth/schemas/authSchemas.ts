import { z } from "zod";

export const emailSchema = z
  .string()
  .min(1, "El correo electrónico es requerido")
  .email("Ingresa un correo electrónico válido")
  .regex(
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    "Ingresa un correo con dominio válido (ej: usuario@dominio.com)"
  );

export const strongPasswordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[A-Z]/, "Debe contener al menos una letra mayúscula (A-Z)")
  .regex(/[a-z]/, "Debe contener al menos una letra minúscula (a-z)")
  .regex(/[0-9]/, "Debe contener al menos un número (0-9)")
  .regex(
    /[^A-Za-z0-9]/,
    "Debe contener al menos un carácter especial (@, #, $, %, etc.)"
  );

export const loginPasswordSchema = z
  .string()
  .min(1, "La contraseña es requerida")
  .min(6, "La contraseña debe tener al menos 6 caracteres");

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  fullName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(50, "El nombre no puede exceder 50 caracteres"),
  email: emailSchema,
  password: strongPasswordSchema,
});

export type RegisterFormData = z.infer<typeof registerSchema>;
