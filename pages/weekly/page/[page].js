import { PageSEO } from '@/components/SEO'
import siteMetadata from '@/data/siteMetadata'
import { getAllFilesFrontMatter } from '@/lib/mdx'
import ListLayout from '@/layouts/ListLayout'
import { WEEKLYS_PER_PAGE } from '../../weekly'

export async function getStaticPaths() {
  const totalPosts = await getAllFilesFrontMatter('weekly')
  const totalPages = Math.ceil(totalPosts.length / WEEKLYS_PER_PAGE)
  const paths = Array.from({ length: totalPages }, (_, i) => ({
    params: { page: (i + 1).toString() },
  }))

  return {
    paths,
    fallback: false,
  }
}

export async function getStaticProps(context) {
  const {
    params: { page },
  } = context
  const posts = await getAllFilesFrontMatter('weekly')
  const pageNumber = parseInt(page)
  const initialDisplayPosts = posts.slice(
    WEEKLYS_PER_PAGE * (pageNumber - 1),
    WEEKLYS_PER_PAGE * pageNumber
  )
  const pagination = {
    currentPage: pageNumber,
    totalPages: Math.ceil(posts.length / WEEKLYS_PER_PAGE),
  }

  return {
    props: {
      posts,
      initialDisplayPosts,
      pagination,
    },
  }
}

export default function PostPage({ posts, initialDisplayPosts, pagination }) {
  return (
    <>
      <PageSEO title={siteMetadata.title} description={siteMetadata.description} />
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
