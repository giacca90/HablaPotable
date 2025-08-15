```
 _________________________________________________________________________________
|                                                                                 |
|  GGGGGG    IIII     AAA      CCCCCC    CCCCCC      AAA      9999999     00000   |
| GG    GG    II     AA AA    CC    CC  CC    CC    AA AA    99     99   00   00  |
| GG          II    AA   AA   CC        CC         AA   AA   99     99  00     00 |
| GG   GGGG   II   AA     AA  CC        CC        AA     AA   99999999  00     00 |
| GG    GG    II   AAAAAAAAA  CC        CC        AAAAAAAAA         99  00     00 |
| GG    GG    II   AA     AA  CC    CC  CC    CC  AA     AA  99     99   00   00  |
|  GGGGGG    IIII  AA     AA   CCCCCC    CCCCCC   AA     AA   9999999     00000   |
|_________________________________________________________________________________|
```

# HablaPotable

# Una extensión para Google Chrome que lee los subtitulos de Udemy en el idioma que elijas.

## ¿Qué es?

Es una extensión para Google Chrome, que de momento funciona bien solo en Udemy, que detecta los subtitulos, detecta el idioma, traduce los subtitulos y los lee en voz alta.

## ¿Cómo funciona?

Una vez que de detecta los subtitulos, utiliza las APIs publicas de Google Translate para detectar el idioma, traducir y leer los subtitulos en voz alta.

## ¿Cómo instalar?

Todavía no la he publicado en el chrome web store, porque no la tengo acabada, y tiene todavía mucha latencia, pero si quieres probarla, la puedes compilar con:

```
npm install
npm run build
```

y luego cargar la carpeta `dist` en Chrome.
