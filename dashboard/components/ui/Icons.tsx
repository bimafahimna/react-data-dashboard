import React from "react";

interface IconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

export const Icons = {
  Google: ({ className, ...props }: IconProps) => (
    <img
      src="/social-icon/google-icon-logo-svgrepo-com.svg"
      alt="Google"
      className={className}
      {...props}
    />
  ),
  Apple: ({ className, ...props }: IconProps) => (
    <img
      src="/social-icon/apple-black-logo-svgrepo-com.svg"
      alt="Apple"
      className={className}
      {...props}
    />
  ),
};
