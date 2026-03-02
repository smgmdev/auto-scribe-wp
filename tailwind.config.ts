import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			display: [
  				'Playfair Display',
  				'Georgia',
  				'serif'
  			],
  			body: [
  				'Inter',
  				'system-ui',
  				'sans-serif'
  			],
  			sans: [
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif',
  				'Apple Color Emoji',
  				'Segoe UI Emoji',
  				'Segoe UI Symbol',
  				'Noto Color Emoji'
  			],
  			serif: [
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			],
  			mono: [
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			]
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))'
  			},
  			warning: {
  				DEFAULT: 'hsl(var(--warning))',
  				foreground: 'hsl(var(--warning-foreground))'
  			},
  			headline: {
  				political: 'hsl(var(--headline-political))',
  				business: 'hsl(var(--headline-business))',
  				financial: 'hsl(var(--headline-financial))',
  				crypto: 'hsl(var(--headline-crypto))',
  				realestate: 'hsl(var(--headline-realestate))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
		keyframes: {
			'shieldHeartbeat': {
				'0%, 100%': { transform: 'scale(1)', filter: 'drop-shadow(0 0 20px rgba(0,122,255,0.3)) brightness(1)' },
				'15%': { transform: 'scale(1.06)', filter: 'drop-shadow(0 0 35px rgba(0,122,255,0.6)) brightness(1.15)' },
				'30%': { transform: 'scale(1)', filter: 'drop-shadow(0 0 20px rgba(0,122,255,0.3)) brightness(1)' },
				'45%': { transform: 'scale(1.04)', filter: 'drop-shadow(0 0 30px rgba(0,122,255,0.5)) brightness(1.1)' },
				'60%': { transform: 'scale(1)', filter: 'drop-shadow(0 0 20px rgba(0,122,255,0.3)) brightness(1)' },
			},
			'shieldPulseRing': {
				'0%, 100%': { transform: 'scale(1)', opacity: '0.3' },
				'50%': { transform: 'scale(1.1)', opacity: '0.05' },
			},
			'shieldOrbit': {
				'0%': { transform: 'rotate(0deg)' },
				'100%': { transform: 'rotate(360deg)' },
			},
			'shieldScan': {
				'0%': { transform: 'translateY(0%)' },
				'50%': { transform: 'translateY(4800%)' },
				'100%': { transform: 'translateY(0%)' },
			},
			'accordion-down': {
				from: {
					height: '0'
				},
				to: {
					height: 'var(--radix-accordion-content-height)'
				}
			},
			'accordion-up': {
				from: {
					height: 'var(--radix-accordion-content-height)'
				},
				to: {
					height: '0'
				}
			},
			'fade-in': {
				from: {
					opacity: '0',
					transform: 'translateY(10px)'
				},
				to: {
					opacity: '1',
					transform: 'translateY(0)'
				}
			},
			'slide-in-left': {
				from: {
					opacity: '0',
					transform: 'translateX(-20px)'
				},
				to: {
					opacity: '1',
					transform: 'translateX(0)'
				}
			},
			'pulse-glow': {
				'0%, 100%': {
					boxShadow: '0 0 20px hsl(38 92% 50% / 0.3)'
				},
				'50%': {
					boxShadow: '0 0 40px hsl(38 92% 50% / 0.5)'
				}
			},
			shimmer: {
				from: {
					backgroundPosition: '200% 0'
				},
				to: {
					backgroundPosition: '-200% 0'
				}
			},
			'loading-bar': {
				'0%': {
					width: '0%',
					marginLeft: '0%'
				},
				'50%': {
					width: '30%',
					marginLeft: '70%'
				},
				'100%': {
					width: '0%',
					marginLeft: '100%'
				}
			},
			'dialog-in': {
				from: {
					opacity: '0',
					transform: 'translate(-50%, -50%) scale(0.96)'
				},
				to: {
					opacity: '1',
					transform: 'translate(-50%, -50%) scale(1)'
				}
			},
			'dialog-out': {
				from: {
					opacity: '1',
					transform: 'translate(-50%, -50%) scale(1)'
				},
				to: {
					opacity: '0',
					transform: 'translate(-50%, -50%) scale(0.96)'
				}
			},
			'dialog-slide-left': {
				from: {
					opacity: '1',
					transform: 'translate(-50%, -50%) scale(1) translateX(0)'
				},
				to: {
					opacity: '0',
					transform: 'translate(-50%, -50%) scale(0.98) translateX(-20px)'
				}
			},
			'dialog-slide-right': {
				from: {
					opacity: '0',
					transform: 'translate(-50%, -50%) scale(0.98) translateX(20px)'
				},
				to: {
					opacity: '1',
					transform: 'translate(-50%, -50%) scale(1) translateX(0)'
				}
			},
			'overlay-in': {
				from: { opacity: '0' },
				to: { opacity: '1' }
			},
			'overlay-out': {
				from: { opacity: '1' },
				to: { opacity: '0' }
			},
			'orbit-spin-1': {
				'0%': { transform: 'rotateX(70deg) rotateY(-20deg) rotateZ(0deg)' },
				'100%': { transform: 'rotateX(70deg) rotateY(-20deg) rotateZ(360deg)' }
			},
			'orbit-spin-2': {
				'0%': { transform: 'rotateX(70deg) rotateY(40deg) rotateZ(0deg)' },
				'100%': { transform: 'rotateX(70deg) rotateY(40deg) rotateZ(360deg)' }
			},
			'orbit-spin-3': {
				'0%': { transform: 'rotateX(70deg) rotateY(100deg) rotateZ(0deg)' },
				'100%': { transform: 'rotateX(70deg) rotateY(100deg) rotateZ(360deg)' }
			},
			'expandDown': {
				'0%': {
					opacity: '0',
					transform: 'scaleY(0)',
					transformOrigin: 'top'
				},
				'100%': {
					opacity: '1',
					transform: 'scaleY(1)',
					transformOrigin: 'top'
				}
			},
			'collapseUp': {
				'0%': {
					opacity: '1',
					transform: 'scaleY(1)',
					transformOrigin: 'top'
				},
				'100%': {
					opacity: '0',
					transform: 'scaleY(0)',
					transformOrigin: 'top'
				}
			},
			'float-1': {
				'0%, 100%': { transform: 'translateY(0px)' },
				'50%': { transform: 'translateY(-8px)' }
			},
			'float-2': {
				'0%, 100%': { transform: 'translateY(0px)' },
				'50%': { transform: 'translateY(-12px)' }
			},
			'float-3': {
				'0%, 100%': { transform: 'translateY(-6px)' },
				'50%': { transform: 'translateY(6px)' }
			},
			'border-glow': {
				'0%': { transform: 'rotate(0deg)' },
				'100%': { transform: 'rotate(360deg)' }
			},
			'purple-glow-pulse': {
				'0%, 100%': { 
					boxShadow: '0 0 30px rgba(191, 90, 242, 0.3), inset 0 0 15px rgba(191, 90, 242, 0.3)'
				},
				'50%': { 
					boxShadow: '0 0 50px rgba(191, 90, 242, 0.5), inset 0 0 25px rgba(191, 90, 242, 0.5)'
				}
			},
			'purple-glow-pulse-intense': {
				'0%, 100%': { 
					boxShadow: '0 0 60px rgba(191, 90, 242, 0.5), inset 0 0 25px rgba(191, 90, 242, 0.4)'
				},
				'50%': { 
					boxShadow: '0 0 90px rgba(191, 90, 242, 0.7), inset 0 0 40px rgba(191, 90, 242, 0.6)'
				}
			},
			'clock-tick': {
				'0%': { transform: 'rotate(0deg)' },
				'10%': { transform: 'rotate(30deg)' },
				'10.5%': { transform: 'rotate(30deg)' },
				'20%': { transform: 'rotate(60deg)' },
				'20.5%': { transform: 'rotate(60deg)' },
				'30%': { transform: 'rotate(90deg)' },
				'30.5%': { transform: 'rotate(90deg)' },
				'40%': { transform: 'rotate(120deg)' },
				'40.5%': { transform: 'rotate(120deg)' },
				'50%': { transform: 'rotate(150deg)' },
				'50.5%': { transform: 'rotate(150deg)' },
				'60%': { transform: 'rotate(180deg)' },
				'60.5%': { transform: 'rotate(180deg)' },
				'70%': { transform: 'rotate(210deg)' },
				'70.5%': { transform: 'rotate(210deg)' },
				'80%': { transform: 'rotate(240deg)' },
				'80.5%': { transform: 'rotate(240deg)' },
				'90%': { transform: 'rotate(270deg)' },
				'90.5%': { transform: 'rotate(270deg)' },
				'100%': { transform: 'rotate(360deg)' }
			},
			'slide-articles': {
				'0%': { transform: 'translateX(0)' },
				'100%': { transform: 'translateX(-50%)' }
			}
		},
		animation: {
			'accordion-down': 'accordion-down 0.2s ease-out',
			'accordion-up': 'accordion-up 0.2s ease-out',
			'fade-in': 'fade-in 0.5s ease-out forwards',
			'slide-in-left': 'slide-in-left 0.4s ease-out forwards',
			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
			shimmer: 'shimmer 3s ease-in-out infinite',
			'loading-bar': 'loading-bar 1.5s ease-in-out infinite',
			'dialog-in': 'dialog-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
			'dialog-out': 'dialog-out 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards',
			'dialog-slide-left': 'dialog-slide-left 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
			'dialog-slide-right': 'dialog-slide-right 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
			'overlay-in': 'overlay-in 0.2s ease-out forwards',
			'overlay-out': 'overlay-out 0.15s ease-out forwards',
			'orbit-spin-1': 'orbit-spin-1 8s linear infinite',
			'orbit-spin-2': 'orbit-spin-2 10s linear infinite reverse',
			'orbit-spin-3': 'orbit-spin-3 12s linear infinite',
			'float-1': 'float-1 4s ease-in-out infinite',
			'float-2': 'float-2 5s ease-in-out infinite',
			'float-3': 'float-3 6s ease-in-out infinite',
			'border-glow': 'border-glow 3s linear infinite',
			'purple-glow-pulse': 'purple-glow-pulse 3s ease-in-out infinite',
			'purple-glow-pulse-intense': 'purple-glow-pulse-intense 3s ease-in-out infinite',
			'clock-tick': 'clock-tick 12s steps(1) infinite',
			'slide-articles': 'slide-articles 15s linear infinite'
		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
