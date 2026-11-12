#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dist="$project_dir/app/dist"
appdir="$dist/TuxScale.AppDir"
version="$(sed -n 's/^version = "\([^"]*\)"$/\1/p' "$project_dir/app/Cargo.toml" | head -n 1)"
test -n "$version"
for tool in fpm rpmbuild dpkg-deb bsdtar zstd; do command -v "$tool" >/dev/null; done
TUXSCALE_SKIP_APPIMAGE=1 bash "$project_dir/app/scripts/package-linux.sh"

common=(-s dir -n tuxscale -v "$version" --iteration 1 --architecture x86_64
  --license AGPL-3.0-only --maintainer 'Abdur Rahman Rifat <arrifat1235@gmail.com>'
  --url https://github.com/arrifat346afs/TuxScale
  --description 'Native Rust and GPUI AI image and video upscaler'
  --force -C "$appdir")
fpm "${common[@]}" -t deb -p "$dist/tuxscale_${version}_amd64.deb" \
  -d 'libc6 >= 2.39' -d libgcc-s1 -d libstdc++6 -d libgomp1 -d libxcb1 \
  -d libxkbcommon0 -d libxkbcommon-x11-0 -d libfontconfig1 -d libfreetype6 \
  -d libvulkan1 -d libegl1 -d ffmpeg -d python3 usr
fpm "${common[@]}" -t rpm -p "$dist/tuxscale-${version}-1.x86_64.rpm" \
  -d 'glibc >= 2.39' -d libgcc -d libstdc++ -d libgomp -d libxcb \
  -d libxkbcommon -d libxkbcommon-x11 -d fontconfig -d freetype \
  -d vulkan-loader -d libglvnd-egl -d ffmpeg-free -d python3 usr
fpm "${common[@]}" -t pacman --pacman-compression zstd \
  -p "$dist/tuxscale-${version}-1-x86_64.pkg.tar.zst" \
  -d 'glibc >= 2.39' -d gcc-libs -d libxcb -d libxkbcommon -d libxkbcommon-x11 \
  -d fontconfig -d freetype2 -d vulkan-icd-loader -d libglvnd -d ffmpeg -d python usr

# Bundle linked libraries for AppImage; glibc and the host GPU drivers stay on
# the target system. Native packages above use their package-manager dependencies.
mkdir -p "$appdir/usr/lib"
while read -r library; do
  case "$(basename "$library")" in
    ld-linux*|libc.so.*|libm.so.*|libmvec.so.*|libpthread.so.*|libdl.so.*|librt.so.*|libresolv.so.*) continue ;;
  esac
  cp -L "$library" "$appdir/usr/lib/"
done < <(ldd "$appdir/usr/bin/tuxscale" "$appdir/usr/share/tuxscale/resources/linux/bin/upscayl-bin" | awk '/=> \// {print $3}' | sort -u)
# GPUI loads font libraries dynamically, so include those dependency trees too.
for soname in libfontconfig.so.1 libfreetype.so.6; do
  library="$(ldconfig -p | awk -v name="$soname" '$1 == name && /x86-64/ && !found {print $NF; found=1}')"
  test -n "$library"
  cp -L "$library" "$appdir/usr/lib/"
  while read -r dependency; do
    case "$(basename "$dependency")" in
      ld-linux*|libc.so.*|libm.so.*|libmvec.so.*|libpthread.so.*|libdl.so.*|librt.so.*|libresolv.so.*) continue ;;
    esac
    cp -L "$dependency" "$appdir/usr/lib/"
  done < <(ldd "$library" | awk '/=> \// {print $3}')
done
cat > "$appdir/AppRun" <<'APPRUN'
#!/usr/bin/env sh
HERE="$(dirname "$(readlink -f "$0")")"
export LD_LIBRARY_PATH="$HERE/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$HERE/usr/bin/tuxscale" "$@"
APPRUN
chmod 755 "$appdir/AppRun"
tool_dir="$(mktemp -d)"
curl -fL --retry 3 https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage -o "$tool_dir/appimagetool"
echo "ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0  $tool_dir/appimagetool" | sha256sum -c -
chmod 755 "$tool_dir/appimagetool"
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$tool_dir/appimagetool" "$appdir" "$dist/TuxScale-${version}-x86_64.AppImage"
tar -C "$dist" -czf "$dist/TuxScale-linux-x86_64.tar.gz" TuxScale.AppDir

dpkg-deb --info "$dist/tuxscale_${version}_amd64.deb"
rpm -qpi "$dist/tuxscale-${version}-1.x86_64.rpm"
bsdtar -xOf "$dist/tuxscale-${version}-1-x86_64.pkg.tar.zst" .PKGINFO
"$dist/TuxScale-${version}-x86_64.AppImage" --appimage-version
cd "$dist"
sha256sum "TuxScale-${version}-x86_64.AppImage" "tuxscale_${version}_amd64.deb" \
  "tuxscale-${version}-1.x86_64.rpm" "tuxscale-${version}-1-x86_64.pkg.tar.zst" \
  TuxScale-linux-x86_64.tar.gz > SHA256SUMS
