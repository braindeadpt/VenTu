'use client'

import Script from 'next/script'

export default function GoatCounterScript() {
  const code = process.env.NEXT_PUBLIC_GOATCOUNTER_CODE

  if (!code || process.env.NODE_ENV === 'development') {
    return null
  }

  return (
    <Script
      src="//gc.zgo.at/count.js"
      data-goatcounter={`https://${code}.goatcounter.com/count`}
      strategy="afterInteractive"
      async
    />
  )
}
