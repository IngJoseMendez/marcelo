import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

/** Sólo lectura de correo y escritura de eventos. Nada más. */
export const ALCANCES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
]

export function crearClienteGoogle(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): OAuth2Client {
  const cliente = new google.auth.OAuth2(clientId, clientSecret)
  // googleapis renueva el access token solo a partir del refresh token.
  cliente.setCredentials({ refresh_token: refreshToken })
  return cliente
}
