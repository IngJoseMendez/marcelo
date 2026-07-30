# Transcripción — nota de voz del cliente

**Archivo:** `WhatsApp Ptt 2026-07-30 at 4.21.57 PM.ogg`
**Duración:** 62,1 s · opus mono 48 kHz
**Método:** ffmpeg (highpass 80 Hz + loudnorm) → `faster-whisper` `large-v3-turbo`, es, beam 5
**Procesado localmente.** El audio no se envió a ningún servicio externo.

> ⚠️ La nota **arranca a mitad de frase**: es el fragmento de una conversación
> más larga. Hay contexto previo que no está en el audio.

## Transcripción con marcas de tiempo

```
[ 0.0 →  16.0]  Por ejemplo, una parte financiera, que una de ellas mismas sea
                capaz de detectar a través, pero no lo va a, pero me estábamos
                y fue entrar a Colombia, o le va a dar el correo ya.
[16.0 →  18.9]  Entonces, son los correos que me llegan, por ejemplo
[18.9 →  19.9]  Ya en Colombia
[19.9 →  21.2]  Ah, no se fueron tanto
[21.2 →  22.6]  Bueno, que ella misma coja esa información
[22.6 →  24.6]  La transporte, la traduzca
[24.6 →  27.1]  Y la meta en su vaina
[27.1 →  29.8]  Y lo mismo, pues con la agenda, o sea
[29.8 →  31.0]  De tiempo
[31.0 →  32.1]  Bueno, que por ejemplo
[32.1 →  34.6]  Yo le tengo dicho que yo todos los miércoles tengo clase
[34.6 →  36.8]  De 4 a 5
[36.8 →  38.8]  No joda
[38.8 →  40.4]  Y que el profesor nos mandó un correo y dice
[40.4 →  41.8]  No, no, clase de hoy se cancela
[41.8 →  44.0]  Bueno, que sea capaz de entender
[44.0 →  45.4]  Entonces
[45.4 →  59.1]  así que eso está viendo el cómo es el correo ella misma cambia
                la agenda y cambia el horario
[59.1 →  62.1]  o lo quite directamente y no tenga que avisarme nada de eso
```

## Zonas de baja confianza

El tramo `0.0 → 16.0` está entrecortado incluso con el modelo grande. La
interpretación adoptada —correos bancarios y de pagos, posiblemente dinero que
entra desde el exterior a Colombia— **no ha sido confirmada con el cliente**.
Ver riesgo abierto nº 1 del spec.

## Comparación de modelos (medida, no estimada)

| Modelo | Resultado con el acento costeño del cliente |
|---|---|
| `small` | Inservible: 3 fragmentos sueltos de 62 s |
| `medium` | Aceptable, con palabras inventadas |
| `large-v3-turbo` | Limpio |

Conclusión que alimenta el diseño: **con este acento, un modelo pequeño de
transcripción no sirve.** La normalización de volumen previa con ffmpeg también
mejoró el resultado de forma apreciable.
