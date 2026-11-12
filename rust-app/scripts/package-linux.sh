#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
appdir="${1:-$project_dir/rust-app/dist/TuxScale.AppDir}"
profile="${TUXSCALE_BUILD_PROFILE:-release}"
case "$profile" in
  release) binary_dir=release ;;
  dev) binary_dir=debug ;;
  *) echo "TUXSCALE_BUILD_PROFILE must be release or dev" >&2; exit 1 ;;
esac

cargo build --locked --profile "$profile" --manifest-path "$project_dir/rust-app/Cargo.toml"
mkdir -p "$appdir/usr/bin" "$appdir/usr/share/tuxscale/resources" \
  "$appdir/usr/share/applications" "$appdir/usr/share/metainfo" \
  "$appdir/usr/share/licenses/tuxscale" "$appdir/usr/share/icons/hicolor/512x512/apps"
install -m755 "$project_dir/rust-app/target/$binary_dir/tuxscale" "$appdir/usr/bin/tuxscale"
for resource in models python linux; do
  cp -a "$project_dir/resources/$resource" "$appdir/usr/share/tuxscale/resources/"
done
if [ -x "$project_dir/resources/python-env/bin/python3" ]; then
  cp -a "$project_dir/resources/python-env" "$appdir/usr/share/tuxscale/resources/"
fi
install -m644 "$project_dir/resources/icon.png" \
  "$appdir/usr/share/icons/hicolor/512x512/apps/io.github.arrifat346afs.TuxScale.png"
install -m644 "$project_dir/io.github.arrifat346afs.TuxScale.desktop" "$appdir/usr/share/applications/"
install -m644 "$project_dir/io.github.arrifat346afs.TuxScale.metainfo.xml" "$appdir/usr/share/metainfo/"
install -m644 "$project_dir/LICENSE" "$appdir/usr/share/licenses/tuxscale/LICENSE"
install -m644 "$project_dir/rust-app/assets/icons/LICENSE" "$appdir/usr/share/licenses/tuxscale/Lucide-LICENSE"
# AppImage tooling discovers the desktop entry and icon at the AppDir root.
install -m644 "$project_dir/io.github.arrifat346afs.TuxScale.desktop" "$appdir/"
install -m644 "$project_dir/resources/icon.png" "$appdir/io.github.arrifat346afs.TuxScale.png"
cat > "$appdir/AppRun" <<'APPRUN'
#!/usr/bin/env sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/tuxscale" "$@"
APPRUN
chmod 755 "$appdir/AppRun"

if command -v appimagetool >/dev/null 2>&1; then
  ARCH=x86_64 appimagetool "$appdir" "$(dirname "$appdir")/TuxScale-x86_64.AppImage"
else
  echo "Created AppDir at $appdir (install appimagetool to produce an AppImage)."
fi
