Put real exercise images/GIFs in this folder.

Naming convention (recommended):
- Use the ExerciseKey from src/app/page.tsx
- Example: bench_press.gif, squat.webp, lat_pulldown.png

The app will try to load:
- /exercises/<exerciseKey>.gif
- /exercises/<exerciseKey>.webp
- /exercises/<exerciseKey>.png
- /exercises/<exerciseKey>.jpg
- /exercises/<exerciseKey>.jpeg
- /exercises/<exerciseKey>.svg

If you add a real file with any of the names above, it will automatically replace the placeholder SVG.
