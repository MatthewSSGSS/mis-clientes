"""
Genera los archivos de calendario (.ics) del "Recordatorio diario".

Son archivos estáticos (uno por hora y tipo de días) para que en iPhone se
abran directo en el Calendario con "Agregar evento". El evento se repite y
trae una alerta a la hora elegida, así el celular avisa aunque la app esté
cerrada.

Si cambias la URL de la app o el texto, edita las constantes y ejecuta:
    python tools/generar_calendarios.py
"""
import os

URL_APP = "https://matthewssgss.github.io/mis-clientes/"
HORAS = range(6, 22)  # 6:00 a 21:00
TIPOS = {
    "diario": "RRULE:FREQ=DAILY",
    "lunsab": "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA",
}
CARPETA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cal")


def ics(hora, tipo, regla):
    lineas = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Mis Clientes//Recordatorio diario//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:mis-clientes-recordatorio-{hora:02d}-{tipo}@mis-clientes",
        "DTSTAMP:20261008T000000Z",
        # Hora "flotante" (sin zona): siempre es la hora local del celular
        f"DTSTART:20261009T{hora:02d}0000",
        "DURATION:PT15M",
        regla,
        "SUMMARY:Mis Clientes: revisa tus mensajes de hoy",
        f"DESCRIPTION:Abre Mis Clientes y toca \"Empezar a enviar\".\\n{URL_APP}",
        f"URL:{URL_APP}",
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Revisa tus clientes de hoy en Mis Clientes",
        "TRIGGER:PT0M",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lineas) + "\r\n"


os.makedirs(CARPETA, exist_ok=True)
for h in HORAS:
    for tipo, regla in TIPOS.items():
        ruta = os.path.join(CARPETA, f"recordatorio-{h:02d}-{tipo}.ics")
        with open(ruta, "w", encoding="utf-8", newline="") as f:
            f.write(ics(h, tipo, regla))
print(f"Listo: {len(HORAS) * len(TIPOS)} archivos en {CARPETA}")
