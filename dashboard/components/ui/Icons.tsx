import React from "react";
import googleIcon from "@/assets/icons/google-icon-logo-svgrepo-com.svg";
import appleIcon from "@/assets/icons/apple-black-logo-svgrepo-com.svg";
import Image from "next/image";

interface IconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

export const Icons = {
  Google: ({ className, width, height, ...props }: IconProps) => (
    <Image
      src={googleIcon.src}
      alt="Google"
      className={className}
      width={Number(width) || 100}
      height={Number(height) || 100}
      {...props}
    />
  ),
  Apple: ({ className, width, height, ...props }: IconProps) => (
    <Image
      src={appleIcon.src}
      alt="Apple"
      className={className}
      width={Number(width) || 100}
      height={Number(height) || 100}
      {...props}
    />
  ),
};
