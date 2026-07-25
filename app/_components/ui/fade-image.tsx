import { useEffect, useRef, useState } from "react";
import { cn } from "@/_lib/utils";

export type FadeImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

function FadeImage({
  alt = "",
  className,
  onLoad,
  onError,
  src,
  ...rest
}: FadeImageProps) {
  const [loadedSrc, setLoadedSrc] = useState<FadeImageProps["src"]>();
  const [failedSrc, setFailedSrc] = useState<FadeImageProps["src"]>();
  const ref = useRef<HTMLImageElement>(null);
  const loaded = Boolean(src) && loadedSrc === src;
  const failed = Boolean(src) && failedSrc === src;

  useEffect(() => {
    const image = ref.current;
    if (!image || !src) return;
    let cancelled = false;
    image
      .decode()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadedSrc(src);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed || !src) return null;

  return (
    <img
      ref={ref}
      alt={alt}
      src={src}
      decoding="async"
      onLoad={(event) => {
        setLoadedSrc(src);
        onLoad?.(event);
      }}
      onError={(event) => {
        setFailedSrc(src);
        onError?.(event);
      }}
      className={cn(
        "transition-opacity duration-300 ease-out",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
      {...rest}
    />
  );
}

export { FadeImage };
