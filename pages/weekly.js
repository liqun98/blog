import { getAllFilesFrontMatter } from '@/lib/mdx'
import siteMetadata from '@/data/siteMetadata'
import ListLayout from '@/layouts/ListLayout'
import { PageSEO } from '@/components/SEO'

export const WEEKLYS_PER_PAGE = 5

export async function getStaticProps() {
  const posts = await getAllFilesFrontMatter('weekly')
  const initialDisplayPosts = posts.slice(0, WEEKLYS_PER_PAGE)
  const pagination = {
    currentPage: 1,
    totalPages: Math.ceil(posts.length / WEEKLYS_PER_PAGE),
  }

  return { props: { initialDisplayPosts, posts, pagination } }
}

export default function Weekly({ posts, initialDisplayPosts, pagination }) {
  return (
    <>
      <PageSEO title={`Weekly - ${siteMetadata.author}`} description={siteMetadata.description} />
      <ListLayout
        posts={posts}
        initialDisplayPosts={initialDisplayPosts}
        pagination={pagination}
        title="All Weekly"
        folder="weekly"
      />
    </>
  )
}
