import Image from 'next/image'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const today = new Date()
const DARKURLS = {
  githubSVGUrl: 'https://raw.githubusercontent.com/liqun98/GitHubPoster/main/OUT_FOLDER/github.svg',
  shanbaySVGUrl:
    'https://raw.githubusercontent.com/liqun98/GitHubPoster/main/OUT_FOLDER/shanbay.svg',
  bilibiliSVGUrl:
    'https://raw.githubusercontent.com/liqun98/GitHubPoster/main/OUT_FOLDER/bilibili.svg',
}

const LIGHTURLS = {
  githubSVGUrl:
    'https://raw.githubusercontent.com/liqun98/GitHubPoster/main/OUT_FOLDER/github_light.svg',
  shanbaySVGUrl:
    'https://raw.githubusercontent.com/liqun98/GitHubPoster/main/OUT_FOLDER/shanbay_light.svg',
  bilibiliSVGUrl:
    'https://raw.githubusercontent.com/liqun98/GitHubPoster/main/OUT_FOLDER/bilibili_light.svg',
}

export default function Timeline() {
  const { theme, resolvedTheme } = useTheme()
  const [SVGUrls, setSVGUrls] = useState(DARKURLS)

  useEffect(() => {
    if (theme === 'dark' || resolvedTheme === 'dark') {
      setSVGUrls(DARKURLS)
    } else {
      setSVGUrls(LIGHTURLS)
    }
  }, [theme, resolvedTheme])

  return (
    <>
      <Image src={SVGUrls.githubSVGUrl} alt="github contribution graph" width={1000} height={200} />
      <Image src={SVGUrls.shanbaySVGUrl} alt="shanbay learning graph" width={1000} height={200} />
      <Image src={SVGUrls.bilibiliSVGUrl} alt="bilibili watching graph" width={1000} height={200} />
    </>
  )
}
