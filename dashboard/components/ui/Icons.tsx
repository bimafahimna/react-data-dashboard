import React from "react";
import googleIcon from "@/assets/icons/google-icon-logo-svgrepo-com.svg";
import appleIcon from "@/assets/icons/apple-black-logo-svgrepo-com.svg";

interface IconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

export const Icons = {
  Google: ({ className, ...props }: IconProps) => (
    <img
      src={googleIcon.src}
      alt="Google"
      className={className}
      {...props}
    />
  ),
  Apple: ({ className, ...props }: IconProps) => (
    <img
      src={appleIcon.src}
      alt="Apple"
      className={className}
      {...props}
    />
  ),
};
