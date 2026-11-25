# Gym Tracker

Tu entrenador programa en Google Sheets y vos registrás el entrenamiento en el celular. Con una hoja v4 vinculada, los cambios de ejercicios, series y cargas llegan a Gym Tracker. Las series que registrás vuelven a la pestaña **Registro app** de esa misma hoja.

## Demo

En 22 segundos, seguí el cambio de press de banca de **3×8 a 4×8** desde la planilla hasta el celular y la serie de **8 repeticiones con 62,5 kg** de vuelta a la hoja. En **Fatiga**, el modelo 3D gira y permite tocar el pecho para ver las cuatro series planificadas. El video cierra con la demostración del press de banca en la **Biblioteca de ejercicios**.

https://github.com/user-attachments/assets/2bd82c9d-afae-4ff5-b513-898c9c0d0ecf

[Descargar el video vertical en MP4](https://github.com/MatiasBoldrini/gym-tracker/raw/refs/heads/main/docs/media/gym-tracker-demo.mp4)

[Abrir Gym Tracker](https://gym-tracker-hojas.vercel.app/bloques) · [Cómo conectar una rutina de Google Sheets](gym-tracker/SETUP_GUIDE.md#compartir-una-rutina-v4)

<details>
<summary>Cómo se grabó la demo</summary>

La demo usa capturas de la app real y datos ficticios. Las vistas de la planilla reproducen un archivo de ejemplo creado en GridCraft. El ensayo ejecutó el importador y el exportador del proyecto con respuestas simuladas de Google y Supabase. La sincronización es periódica y el video abrevia la espera. [Cómo funciona la sincronización](gym-tracker/supabase/ops/README.md#verificación)

La música se creó para esta demo. La demostración de press de banca es de [Strength Level](https://strengthlevel.com/).

El modelo de **Fatiga** adapta [Free Muscle](https://github.com/tiralonghipol/free-muscles) de tiralonghipol, basado en [Z-Anatomy](https://www.z-anatomy.com/) de Gauthier Kervyn y colaboradores y en [BodyParts3D](https://lifesciencedb.jp/bp3d/) © The Database Center for Life Science. Gym Tracker simplificó el modelo y agrupó las piezas por músculo. El modelo adaptado y el plano que lo muestra se comparten bajo [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

</details>
