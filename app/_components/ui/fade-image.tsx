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
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = ref.current;
    if (!image || !src) return;
    setLoaded(false);
    let cancelled = false;
    image
      .decode()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <img
      ref={ref}
      alt={alt}
      src={src}
      decoding="async"
      onLoad={onLoad}
      onError={(event) => {
        setLoaded(true);
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
