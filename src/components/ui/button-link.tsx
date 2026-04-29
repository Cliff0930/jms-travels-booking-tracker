import Link from 'next/link'
import { buttonVariants } from './button'
import { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

interface ButtonLinkProps extends VariantProps<typeof buttonVariants> {
  href: string
  className?: string
  children: React.ReactNode
}

export function ButtonLink({ href, variant, size, className, children }: ButtonLinkProps) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </Link>
  )
}
